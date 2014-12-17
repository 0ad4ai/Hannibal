/*jslint bitwise: true, browser: true, todo: true, evil:true, devel: true, debug: true, nomen: true, plusplus: true, sloppy: true, vars: true, white: true, indent: 2 */
/*globals HANNIBAL, deb, uneval */

/*--------------- E C O N O M Y -----------------------------------------------

  Priotizes requests for resources. Trains, researches and construct them.
  includes stats, producers, order, orderqueue

  tested with 0 A.D. Alpha 15 Osiris
  V: 0.1, agentx, CGN, Feb, 2014

*/


HANNIBAL = (function(H){

  H.LIB.Stats = function(context){

    var 
      bufferLength = context.config.stats.lengthStatsBuffer,
      ress = {food: 0, wood: 0, stone: 0, metal: 0, pops: 0, health: 0, area: 0};

    H.extend(this, {

      klass:    "stats",
      context:  context,
      imports:  [
        "player"
      ],

      ress:        H.deepcopy(ress),
      gatherables: ["food", "wood", "stone", "metal"],

      stock: H.deepcopy(ress), 
      // totals gathered, difference per tick, flow = avg over diff
      suply: H.deepcopy(ress), 
      diffs: H.map(ress, H.createRingBuffer.bind(null, bufferLength, [], 0, 0)),
      flows: H.deepcopy(ress), 
      alloc: H.deepcopy(ress), // allocated per queue
      forec: H.deepcopy(ress), // ???
      trend: H.deepcopy(ress), // as per suply
      stack: H.map(ress, H.createRingBuffer.bind(null, bufferLength, [], 0, 0)), // last x stock vals

    });

  };

  H.LIB.Stats.prototype = {
    constructor: H.LIB.Stats,
    toString: function(){return H.format("[%s %s:%s]", this.klass, this.context.name, this.name);},
    log: function(){
      deb();
      deb("   STS: stock: %s", JSON.stringify(this.stock));
    },
    initialize: function(){
      this.tick();
      return this;
    },
    clone: function(context){
      return (
        new H.LIB[H.noun(this.name)](context)
          .import()
          .deserialize(this.serialize())
      );
    },
    import: function(){
      this.imports.forEach(imp => this[imp] = this.context[imp]);
      return this;
    },
    deserialize: function(data){ // child
      if (data){
        H.extend(this, {
          stock: data.stock, 
          suply: data.suply, 
          diffs: H.map(data.diffs, (key, data) => H.createRingBuffer.apply(null, data)), // last x stock vals
          flows: data.flows, 
          alloc: data.alloc,
          forec: data.forec, 
          trend: data.trend, 
          stack: H.map(data.stack, (key, data) => H.createRingBuffer.apply(null, data)), // last x stock vals
        });
      }
      return this;
    },
    serialize: function(){
      return {
        stock: H.deepcopy(this.stock), 
        suply: H.deepcopy(this.suply), 
        diffs: H.map(this.diffs, (key, buffer) => buffer.serialize()), // buffer !!
        flows: H.deepcopy(this.flows), 
        alloc: H.deepcopy(this.alloc),
        forec: H.deepcopy(this.forec), 
        trend: H.deepcopy(this.trend), 
        stack: H.map(this.stack, (key, buffer) => buffer.serialize()), // buffer !!
      };
    },
    tick: function(tick, secs){

      var 
        t0 = Date.now(), curHits = 1, maxHits = 1, 
        gathered  = this.player.statistics.resourcesGathered,
        available = this.player.resourceCounts;
          
      // gather diffs
      this.gatherables.forEach( prop => { 
        this.diffs[prop].push(gathered[prop] - this.suply[prop]); // prep flows
        this.suply[prop]   = gathered[prop];                 // totals
        this.stock[prop]   = available[prop];                // available
      });
      
      // other data
      this.stock.pops   = this.player.popCount;
      this.stock.area   = this.player.statistics.percentMapExplored;
      this.stock.health = ~~((curHits / maxHits) * 100); // integer percent only    

      // buffers
      H.attribs(this.ress).forEach( prop => { 
        this.stack[prop].push(this.suply[prop]);      // buffers
        this.trend[prop] = this.stack[prop].trend();  // trend
        this.flows[prop] = this.diffs[prop].avg();    // 
      });

      return Date.now() - t0;

    },

  };

  H.LIB.Producers = function(context){

    H.extend(this, {

      name:    "producers",
      context: context,
      imports: [
        "query",
        "culture",
        "config",
        "entities",
        "metadata",
      ],

      producers: null,

      maxqueue: 0,

      // producer info template
      info:      {
        id:        0,   // entity id
        name:     "",   // node name
        queue:    [],   // taskids or techs
        simqueue: [],   // simulates engine's queue for simulations
        allocs:    0,   // per orderqueue cycle
      },

    });

  };

  H.LIB.Producers.prototype = {
    constructor: H.LIB.Producers,
    log: function(){
      var count;
      deb();
      if ((count = H.count(this.producers))){
        deb("   PDC: have %s producers", count);
        H.attribs(this.producers)
          .sort((a, b) => ~~a < ~~b ? -1 : 1)
          .forEach( nameid => {
            var [name, id] = nameid.split("#");
            deb("   PDC: %s %s", id, this.infoProducer(name));
        });
      } else {
        deb("   PDC: log: no producer registered");
      }
    },
    logTick: function(){
      var count, name, id, allocs, queue, t = H.tab;
      if ((count = H.count(this.producers))){
        deb("   PDC: have %s producers", count);
        deb("*");
        H.attribs(this.producers)
          // .filter(a => this.producers[a].queue.length)
          .sort((a, b) => this.producers[a].queue.length > this.producers[b].queue.length ? -1 : 1)
          .forEach( nameid => {
            [name, id] = nameid.split("#");
            allocs = this.producers[nameid].allocs;
            queue  = this.producers[nameid].queue;
            deb("     P: %s %s %s ", t("#" + id, 4), t(allocs,3), uneval(queue), nameid);
        });
        deb("*");
      } else {
        deb("   PDC: log: no producer registered");
      }
    },
    import: function(){
      this.imports.forEach(imp => this[imp] = this.context[imp]);
      return this;
    },
    clone: function(context){
      return (
        new H.LIB[H.noun(this.name)](context)
          .import()
          .initialize(this.serialize())
      );
    },
    deserialize: function(data){ // child
      deb("   PDC: deserialize.in: %s", uneval(data));
      this.producers = data ? data : null; //{};
      return this;
    },
    serialize: function(){
      return H.deepcopy(this.producers);
    },
    initialize: function(){
      this.maxqueue = this.config.economy.maxQueueLength;
      return this;
    },
    finalize: function(){
      // deb("   PDC: finalize.in: %s", uneval(this.producers));
      if (!this.producers){
        this.producers = {};
        // this.query("INGAME").execute().forEach(this.register.bind(this));
        this.query("INGAME").execute().forEach(this.register, this);
      }
    },
    infoProducer: function(name){
      var tree = this.culture.tree.nodes;
      return H.format("%s train: %s, build: %s, research: %s", name,
        H.count(tree[name].products.train),
        H.count(tree[name].products.build),
        H.count(tree[name].products.research)
      );
    },
    findCentre: function(){
      var producer, names = H.attribs(this.producers), i = names.length;
      while ((producer = this.producers[names[--i]])){
        if (producer.name === this.nameCentre){
          return producer;
        }
      }      
      return null;
    },
    register: function(nodeOrId){

      var 
        check, 
        node = H.isInteger(nodeOrId) ? this.query("INGAME WITH id = " + nodeOrId).first() : nodeOrId,
        id   = H.isInteger(nodeOrId) ? nodeOrId : node.id,
        name = node.name.split("#")[0],
        tree = this.culture.tree.nodes;

      // deb("   PDC: to register: %s, %s", name, id);

      check = (
        !this.producers[node.name] &&                 // is not already registered
        tree[name]                 &&                 // is a node
        tree[name].products.count                     // has products
      ); 

      if (check){
        this.producers[node.name] = H.mixin(
          H.deepcopy(this.info), {id: id, name: name}
        );
        // deb("   PDC: registered: %s", uneval(this.producers[node.name]));
      } else {
        // deb("   PDC: NOT registered: %s, %s", name, id);
      }

    },
    remove: function(nodeOrId){
      
      var id = H.isInteger(nodeOrId) ? nodeOrId : nodeOrId.id;

      H.each(this.producers, (nameid, info) => {
        if (info.id === id){
          delete this.producers[nameid];
          deb("   PDC: removed id: %s, name: %s", id, info.name);
        }        
      });

    },  
    // canqueue: function(producer, amount){
    //   return producer.queue.length + amount < this.maxqueue;
    // },
    queue: function(producer, taskidOrTech){
      producer.queue.push(taskidOrTech);
      deb("   PDC: queued: task: %s in queue: %s | %s", taskidOrTech, producer.queue, producer.name);
    },
    unqueue: function(verb, taskidOrTech){

      // probably slow

      var found = false;

      H.each(this.producers, (name, producer) => {
        if(!found && producer.queue.length){
          if (H.delete(producer.queue, task => task === taskidOrTech)){
            found = true;
            deb("   PDC: unqueue: removed task: %s from queue: %s | %s", taskidOrTech, producer.queue, producer.name);
          }
        }
      });

      if (!found) {
        deb("   PDC: unqueue: not found in any queue: %s, %s", verb, taskidOrTech);
      }

    },
    resetAllocations: function(){
      H.each(this.producers, (name, producer) => {
        producer.allocs = producer.queue.length;
      });      
    },
    allocate: function(node, verb){

      if (verb === "build"){
        return true;

      } else if (node.producer.allocs < this.maxqueue){
        node.producer.allocs += 1;
        return true;
      
      } else {
        return false;

      }

    },
    find: function(product, cc){

      // returns matching producer with most free slots, if avail.
      // TODO: calculate exactly best producer, based on queue length and -items

      var 
        producer, check = false, found = false, candidates = [],
        tree  = this.culture.tree.nodes,
        verb  = tree[product].verb, 
        names = H.attribs(this.producers),
        i     = names.length;

      switch (verb){

        case "build":

          // only checks for existence no queue when building
          while (i-- && !found){
            producer = this.producers[names[i]];
            if (tree[producer.name].products.build[product]){
              found = true;  
            }        
          }

        break;

        case "research":

          // can ignore cc
          if (product.contains("phase")){
            if ((producer = this.findCentre())){ // TODO: search over all centres
              if (producer.allocs >= this.maxqueue){
                // deb("   PDC: max: %s", uneval(producer));
                producer = null;
              }
            }
          } else {
            while (i-- && !found){
              producer = this.producers[names[i]];
              found = (
                tree[producer.name].products.research[product] && 
                producer.allocs < this.maxqueue
              );
            }
          }
        break;
        
        case "train": //TODO: break on allocs = 0;

          while (i-- && !found){
            producer = this.producers[names[i]];
            check = (
              tree[producer.name].products.train[product] &&
              producer.allocs < this.maxqueue && 
              (!cc || this.metadata[producer.id].cc === cc)
            );
            if (check){
              candidates.push(producer);
            }
          }
          if (candidates.length){
            found = true;
            candidates.sort((a, b) => a.allocs > b.allocs ? 1 : -1);
            producer = candidates[0];
          }

        break;

        default: 
          // units.athen.infantry.archer.a
          // H.throw("PDC: can't find producer for %s with unknwon verb: '%s'", product, verb);
          return null;
        
      }

      if (producer && found){
        // deb("   PDC: found: verb: %s : %s#%s for %s in %s, meta: %s", 
        //   verb, 
        //   producer.name, producer.id, 
        //   product, cc,
        //   uneval(this.metadata[producer.id])
        // );
      } else {
        // deb("   PDC: no producer found for %s at cc: %s", product, cc)      
      }

      return producer && found ? producer : null;

    },

  };

  H.LIB.Order = function(context){

    H.extend(this, {

      name: "order",
      context: context,
      imports: [
        // "id",
        "bot",
        "economy",
        "query",
        "culture",
        "technologies",
        "events",
      ],

    });

    //TODO: make units move to order.position

  };

  H.LIB.Order.prototype = {
    constructor: H.LIB.Order,
    log: function(){},
    logTick: function(){},
    initialize: function(order){
      H.extend(this, order, {
        id:         order.id         || this.context.idgen++,
        processing: 0,
        remaining:  order.remaining  || order.amount,
        product:    null,
        x:          order.location ? order.location[0] : undefined,
        z:          order.location ? order.location[1] : undefined,
      });
      return this;
    },
    clone: function(context){
      return (
        new H.LIB[H.noun(this.name)](context)
          .import()
          .initialize(this.serialize())
      );
    },
    import: function(){
      this.imports.forEach(imp => this[imp] = this.context[imp]);
      return this;
    },
    serialize: function(){
      return {
        id:         this.id,
        x:          this.x,
        z:          this.z,
        amount:     this.amount,
        remaining:  this.remaining,
        processing: this.processing,
        verb:       this.verb, 
        hcq:        this.hcq, 
        source:     this.source, 
        shared:     this.shared,
      };
    },

    evaluate: function(allocs){

      // analyzes the order specs and 
      // assigns ingame entities, if possible or
      // finds the one best fitting template 
      // to produce

      var 
        sorter, producer,
        producers = this.economy.producers;

      this.product = null;   // to be determined

      if(this.remaining - this.processing < 1){
        // nothing left to do
        return;
      }

      // make own copy of store data
      this.nodes = this.query(this.hcq).map( node => {
        return {
          name:      node.name,
          key:       node.key,
          costs:     node.costs,
          qualifies: true,
          producer:  null,
          info:      ""
        };
      });

      // assigns ingames if available and matching
      this.assignExisting();      
      if(this.remaining - this.processing < 1){
        // nothing left to do
        return;
      } 

      // check whether ingame producer exists
      this.nodes.forEach( node => {
        // deb("evaluate: %s node: ", self.id, node.name);
        producer = producers.find(node.name, this.cc);
        if (producer){
          node.producer = producer;
          // deb("evaluate: %s prod for %s #%s %s", self.id, node.name, producer.id, producer.name);
        } else {
          node.qualifies = false;
          node.info += !producer ? "no producer, " : "";
        }
      });

      // any unmet techs
      this.nodes
        .filter( node => node.qualifies)
        .forEach( node => {

          var 
            req    = this.culture.tree.nodes[node.name].requires,
            phase  = this.culture.tree.nodes[node.name].phase,
            phases = this.culture.phases;
          
          if (phases.find(phase).idx > phases.find(phases.current).idx){
            node.qualifies = false; 
            node.info = "needs phase " + phase; 
            return;
          }

          if (req && !this.technologies.available([req])){
            node.qualifies = false; 
            node.info = "needs req " + req; 
            return;
          }

      });  

      this.nodes.forEach( node => {
        // deb("    OE: %s %s", node.name, node.info);
      });

      // remove disqualified nodes
      H.delete(this.nodes, node => !node.qualifies);

      // still here?
      if (this.nodes.length){

        // bot priotizes units by phase, speed, availability, armor, etc.
        if (this.verb === "train"){        
          sorter = this.bot.unitprioritizer();
          sorter(this.nodes);
        }

        // try to allocate slot from top node producer
        if (producers.allocate(this.nodes[0], this.verb)){

          // we have a winner
          this.product    = this.nodes[0];  
          this.executable = true;

        } else {
          // too bad
        }

      }

    },
    assignExisting: function(){

      var verb = this.verb, hcq = (

        // looking for a technology
        verb === "research" ? this.hcq :

        // looking for unit not assigned to a group
        verb === "train" ? this.hcq + " INGAME WITH metadata.opname = 'none'" :
        
        // looking for a shared structure
        verb === "build" && this.shared ? this.hcq + " INGAME WITH metadata.opmode = 'shared'" :

        // looking for abandoned structure not assigned to a group
        verb === "build" && !this.shared ? this.hcq + " INGAME WITH metadata.opname = 'none'" :

        // error
          deb("ERROR : assignExisting run into unhandled case: %s, shared: %s", this.verb, this.shared)
      
      );

      if (verb === "train" || verb === "build"){
        this.query(hcq)
          .execute()
          .slice(0, this.remaining - this.processing)
          .forEach( node => {
            this.remaining -= 1; 
            this.events.fire("OrderReady", {
              player: this.context.id,
              id:     node.id,
              data:   {order: this.id, source: this.source}
          });
        });
      } else {
        deb("   ORD: assignExisting: looking for '%s' ????????", this.hcq);
      }

    },

  };
  H.LIB.Orderqueue = function(context){

    H.extend(this, {

      name:    "orderqueue",
      context:  context,
      imports:  [
        "economy",
        "groups",
      ],

      report: {rem: [], exe: [], ign: []},
      tP: 0, // processing time, msecs
      queue: null,

      logProcessing: false,
      logWaiting:    false,

    });

  };

  H.LIB.Orderqueue.prototype = {
    constructor: H.LIB.Orderqueue,
    log: function(){
      deb();
      if (this.queue.length){
        this.queue.forEach( order => {
          order.log();
        });
      } else {
        deb("   ORQ: empty");
      }
    },
    logTick: function(){

      var 
        msg  = "", tb = H.tab,
        header = "  id,     verb, amt, pro, rem, nodes, flags,                 source | template".split(","),
        tabs   = "   4,       10,   5,   5,   5,     7,     7,                    24".split(",").map(s => ~~s),
        head   = header.map(String.trim).slice(0, -1),
        retr = {
          id:       o => "#" + o.id,
          verb:     o => o.verb,
          amt:      o => o.amount,
          rem:      o => o.remaining,
          pro:      o => o.processing,
          nodes:    o => o.nodes ? o.nodes.length : 0,
          flags:    o => (o.product ? "P" : "_"),
          source:   o => this.groups.findAssets(ast => ast.id === o.source)[0].name || "no source :(",
        };

      deb("   ORQ: length: %s, rep: %s", this.queue.length, uneval(this.report));
      if (this.queue.length){
        deb("*");
        deb("     Q: %s", header);
        this.queue
          .sort((a,b) => a > b ? 1 : -1)
          .forEach(o => {
            msg = "";
            H.zip(head, tabs, (h, t) => {
              msg += tb(retr[h](o), t);
            });
            deb("     Q: %s | %s", msg, o.product ? o.product.name : "no product");
          });
        deb("*");
      }

    },
    import: function(){
      this.imports.forEach(imp => this[imp] = this.context[imp]);
      return this;
    },
    clone: function(context){
      return (
        new H.LIB[H.noun(this.name)](context)
          .import()
          .initialize(this.serialize())
      );
    },
    serialize: function(tick, secs){
      return this.queue.map( order => order.serialize());
    },
    deserialize: function(data){
      if(data){
        this.queue = [];
        data.forEach( order => {
          this.queue.push(
            new H.LIB.Order(this.context)
              .import()
              .initialize(order)
          );
        });
      }
      return this;
    },
    initialize: function(data){
      this.queue = this.queue || [];
      return this;
    },
    delete: function(fn){return H.delete(this.queue, fn);},
    find: function(fn){
      var i = this.queue.length;
      while(i--){if (fn(this.queue[i])){return this.queue[i];}}
      return undefined;
    },
    process: function(){

      var 
        t0 = Date.now(), 
        amount, msg, t = H.tab, 
        hasBuild      = false, // only one construction per tick
        allGood       = false, 
        rep           = this.report,
        queue         = this.queue,
        eco           = this.economy,
        allocs        = H.deepcopy(eco.allocations),
        budget        = H.deepcopy(eco.stats.stock);
        
      // reset logging array
      rep.rem.length = 0; rep.ign.length = 0; rep.exe.length = 0;

      // queue empty -> exit
      if (!queue.length){this.tP = 0; return;}

      // clear allocs from last tick
      eco.producers.resetAllocations();

      // evaluate for product/producer/cost
      queue.forEach(order => {
        order.evaluate();
        if (!!order.product){
          amount = order.remaining - order.processing;
          allocs.food  += order.product.costs.food  * amount;
          allocs.wood  += order.product.costs.wood  * amount;
          allocs.stone += order.product.costs.stone * amount;
          allocs.metal += order.product.costs.metal * amount;
        }
      });

      // get first quote whether all orders fit budget
      allGood = eco.fits(allocs, budget);  

      // rep / debug
      // msg = "    OQ: #%s %s amt: %s, rem: %s, pro: %s, verb: %s, nodes: %s, from %s ([0]: %s)";
      // queue
      //   .forEach(o => {
      //     var 
      //       isWaiting = o.remaining === o.processing,
      //       exec = o.executable ? "X" : "-",
      //       source = H.isInteger(o.source) ? this.groups.findAsset(o.source).name : o.source,
      //       nodename = o.nodes.length ? o.nodes[0].name : "hcq: " + o.hcq.slice(0, 40);
      //     if(!(isWaiting && !logWaiting)){
      //       deb(msg, t(o.id, 3), exec, t(o.amount, 2), t(o.remaining, 2), t(o.processing, 2), o.verb.slice(0,5), t(o.nodes.length, 3), source, nodename);
      //     }
      // });

      // choose executables, sort and process
      queue
        .filter(order => !!order.product)
        .sort((a, b) => eco.prioVerbs.indexOf(a.verb) < eco.prioVerbs.indexOf(b.verb) ? -1 : 1)
        .forEach( order => {

          var 
            id  = order.id,
            product = order.product;

          // process all or one
          amount = allGood ? order.remaining - order.processing : 1;

          // final global budget check
          if (eco.fits(product.costs, budget, amount)){

            switch(order.verb){

              case "train":
                eco.do("train", amount, order); 
                eco.subtract(product.costs, budget, amount);
                rep.exe.push(id + ":" + amount);
              break;

              case "build":
                if (!hasBuild){
                  hasBuild = true;
                  eco.do("build", 1, order); 
                  eco.subtract(product.costs, budget, 1);
                  rep.exe.push(id + ":" + amount);
                } else {
                  deb("    OQ: #%s build postponed (%s)", t(id, 3), product.name);
                }
              break;

              case "research":
                eco.do("research", amount, order);
                eco.subtract(product.costs, budget, amount);
                rep.exe.push(id + ":" + amount);
              break;

              default:
                deb("ERROR : orderQueue.process: #%s unknown order.verb: %s", id, order.verb);

            }

          } else {
            rep.ign.push(id);

          }


      });

      queue
        .filter( order => order.remaining === 0)
        .forEach( order => {
          rep.rem.push(order.id);
          H.remove(this.queue, order);
      });

      this.tP = Date.now() - t0;

    }   
  };

  H.LIB.Economy = function(context){

    H.extend(this, {

      name: "economy",
      context: context,
      imports: [
        "id",
        "config",
        "map",
        "effector",
        "events",
        "player",
        "query",
        "groups",
        "metadata",
      ],
      childs: [
        "stats",
        "producers",
        "orderqueue",
      ],
      
      prioVerbs:    ["research", "train", "build"],
      availability: ["food", "wood", "stone", "metal"],
      allocations:  {food: 0, wood: 0, stone: 0, metal: 0},

    });

  };

  H.LIB.Economy.prototype = {
    constructor: H.LIB.Economy,
    log: function(){
      this.childs.forEach(child => this[child].log());
    },
    logTick: function(){
      
      // var 
      //   stock = this.stats.stock, 
      //   flows = this.stats.flows,
      //   t = H.tab, f = n => n > 0 ? "+" + n : n === 0 ? " 0": n;

        // deb("   ECO: F%s %s, W%s %s, M%s %s, S%s %s, P%s %s, A%s %s, H%s %s", 
        //   t(stock.food,   6), f(flows.food.toFixed(1)),
        //   t(stock.wood,   6), f(flows.wood.toFixed(1)),
        //   t(stock.metal,  6), f(flows.metal.toFixed(1)),
        //   t(stock.stone,  6), f(flows.stone.toFixed(1)),
        //   t(stock.pops,   4), f(flows.pops.toFixed(1)),
        //   t(stock.area,   4), f(flows.area.toFixed(1)),
        //   t(stock.health, 4), f(flows.health.toFixed(1))
        // );

    },
    import: function(){
      this.imports.forEach(imp => this[imp] = this.context[imp]);
      return this;
    },
    clone: function (context){
      return new H.LIB[H.noun(this.name)](context);
    },
    serialize: function(){
      return {
        stats:      this.stats.serialize(),
        producers:  this.producers.serialize(),
        orderqueue: this.orderqueue.serialize(),
      };
    },
    deserialize: function(){
      if (this.context.data[this.name]){
        this.childs.forEach( child => {
          if (this.context.data[this.name][child]){
            // deb("   ECO: child.deserialize: %s", child);
            this[child] = new H.LIB[H.noun(child)](this.context)
              .import()
              .deserialize(this.context.data[this.name][child]);
          }
        });
      }
    },
    initialize: function(){
      this.childs.forEach( child => {
        if (!this[child]){
          // deb("   ECO: child.initialize: %s", child);
          this[child] = new H.LIB[H.noun(child)](this.context)
            .import()
            .initialize();
        }
      });
      return this;
    },
    finalize: function(){
      this.childs.forEach( child => {
        if (this[child].finalize){
          this[child].finalize();
        } 
      });
    },
    activate: function(){
      
      var order;

      this.events.on("EntityRenamed", msg => {
        this.producers.remove(msg.id);
        this.producers.register(msg.id2);
      });

      // new technology
      this.events.on("Advance", msg => {
        if (this.orderqueue.delete(order => order.hcq === msg.data.technology)){
          this.producers.unqueue("research", msg.data.technology);
          deb("   ECO: onAdvance: removed order with tech: %s", msg.data.technology);
        }        
      });

      // new producer
      this.events.on("ConstructionFinished", msg => {
        this.producers.register(this.query("INGAME WITH id = " + msg.id).first());
      });

      // new unit
      this.events.on("TrainingFinished", msg => {

        deb("   ECO: TrainingFinished id: %s, meta: %s", msg.id, uneval(this.metadata[msg.id]));

        if (!msg.data.task){
          deb("WARN   : ECO: got unit not ordered");
          return;
        }

        this.producers.register(msg.id);
        this.producers.unqueue("train", msg.data.task); 

        order = this.orderqueue.find(order => order.id === msg.data.order);
        order.remaining  -= 1;
        order.processing -= 1;
        
        this.events.fire("OrderReady", {
          player: this.id,
          id:     msg.id,
          data:   {order: msg.data.order, source: order.source}
        });

      });

      // new metadata
      this.events.on("AIMetadata", msg => {

        order = this.orderqueue.find(msg.data.order);
        order.remaining  -= 1;
        order.processing -= 1;

        deb("   ECO: on AIMetadata order: #%s from %s", order.id, this.groups.findAsset(order.source).name);
        
        // H.Objects(order.source).listener("Ready", id);  
        this.events.fire("OrderReady", {
          player: this.id,
          id:     msg.id,
          data:   {order: msg.data.order, source: order.source}
        });

      });

      // remove entity
      this.events.on("Destroy", msg => {
        this.producers.remove(msg.id);
      });

    },
    tick: function(tick, secs){

      var stock = this.stats.stock, t0 = Date.now();

      // sort availability by stock
      this.availability.sort((a, b) => stock[a] > stock[b] ? 1 : -1);

      this.orderqueue.process();

      this.orderqueue.logTick();
      this.producers.logTick();
      this.logTick();
      
      return Date.now() - t0;

    },
    multiply: function(cost, amount=1){
      cost.food  *= amount;
      cost.wood  *= amount;
      cost.metal *= amount;
      cost.stone *= amount;
    },
    subtract: function(cost, budget, amount=1){
      budget.food  -= cost.food  > 0 ? (cost.food  * amount) : 0;
      budget.wood  -= cost.wood  > 0 ? (cost.wood  * amount) : 0;
      budget.metal -= cost.metal > 0 ? (cost.metal * amount) : 0;
      budget.stone -= cost.stone > 0 ? (cost.stone * amount) : 0;
    },
    fits: function(cost, budget, amount=1){
      return (
        ((cost.food  || 0) * amount) <= (budget.food  || 0) &&
        ((cost.wood  || 0) * amount) <= (budget.wood  || 0) &&
        ((cost.stone || 0) * amount) <= (budget.stone || 0) &&
        ((cost.metal || 0) * amount) <= (budget.metal || 0)
      );  
    },
    diff: function(cost, budget, amount=1){
      return {
        food:   (budget.food   || 0) - (cost.food   || 0 * amount),
        wood:   (budget.wood   || 0) - (cost.wood   || 0 * amount),
        stone:  (budget.stone  || 0) - (cost.stone  || 0 * amount),
        metal:  (budget.metal  || 0) - (cost.metal  || 0 * amount),
        pop  :  (budget.pop    || 0) - (cost.pop    || 0 * amount),
        popcap: (budget.popcap || 0) - (cost.popcap || 0 * amount),
      };
    },
    request: function(order){
      
      // probably useless layer, but eco may reject orders...
      //     entityCounts: OBJECT (Apadana, Council, DefenseTower, Embassy, Fortress, ...)[13]
      //     entityLimits: OBJECT (Apadana, Council, DefenseTower, Embassy, Fortress, ...)[13]

      var  
        objorder,
        // debug
        sourcename = this.groups.findAssets(ast => ast.id === order.source)[0].name,  // this is an group instance
        loc = (order.location === undefined) ? "undefined" : H.fixed1(order.location);

      if (order.verb === "build" && order.x === undefined){
        H.throw("ERROR : %s order without position, source: %s", verb, sourcename);
      }

      objorder = new H.LIB.Order(this.context).import().initialize(order);
      this.orderqueue.queue.push(objorder);

      deb("  EREQ: #%s, %s amount: %s, cc: %s, loc: %s, from: %s, shared: %s, hcq: %s",
        objorder.id, 
        objorder.verb, 
        objorder.amount, 
        objorder.cc || "NO CC" , 
        loc, 
        sourcename,  // that's an asset
        objorder.shared, 
        objorder.hcq.slice(0, 40)
      );

    },
    do: function(verb, amount, order){

      var 
        pos, task, 
        product  = order.product,
        id = product.producer.id, 
        msg = ( verb === "build" ?
          "   EDO: #%s %s, producer: %s, amount: %s, tpl: %s, x: %s, z: %s" : 
          "   EDO: #%s %s, producer: %s, amount: %s, tpl: %s"
        );

      order.processing += amount;

      switch(verb){

        case "train" :
          task = this.context.idgen++;
          this.producers.queue(product.producer, task);
          deb(msg, order.id, verb, id, amount, product.key); 
          this.effector.train([id], product.key, amount, {order: order.id, task: task, cc:order.cc});
        break;

        case "research" : 
          this.producers.queue(product.producer, product.name);
          deb(msg, order.id, verb, id, 1, product.key); 
          this.effector.research(id, product.key);
        break;

        case "build" : 
          // needs no queue
          pos = this.map.findGoodPosition(product.key, [order.x, order.z]);
          deb(msg, order.id, verb, id, 1, product.key, order.x.toFixed(0), order.z.toFixed(0)); 
          this.effector.construct([id], product.key, [pos.x, pos.z, pos.angle], {order: order.id, cc:order.cc});
        break;

      }

    },

  };

return H; }(HANNIBAL));



  // H.Economy = (function(){

  //       flowBarrack  = tree[cls("barracks")].flow;
  //       flowCentre   = tree[cls("civcentre")].flow;
  //       flowFortress = tree[cls("fortress")].flow;

  //       deb("   ECO: max flow centre  : %s ", uneval(flowCentre));
  //       deb("   ECO: max flow barracks: %s ", uneval(flowBarrack));
  //       deb("   ECO: max flow fortress: %s ", uneval(flowFortress));

  //     },

  //       // sort availability by stock
  //       self.availability.sort((a, b) => stock[a] > stock[b] ? 1 : -1);


  //       // H.OrderQueue.process();
  //       // H.OrderQueue.log();
  //       self.orderqueue.process();

  //       // deb("orderqueue: %s", H.attribs(self.orderqueue));

  //       self.orderqueue.log();
  //       self.logTick();
        
  //       return Date.now() - t0;

  //     },
  //     activate: function(){

  //       var node, order;

  //       H.Events.on("EntityRenamed", function (msg){

  //         node = H.QRY("INGAME WITH id = " + msg.id).first();
  //         if (node){
  //           self.producers.remove(node);
  //         } else {
  //           deb("WARN  : eco.activate.EntityRenamed: id %s no ingame", msg.id);
  //         }

  //         node = H.QRY("INGAME WITH id = " + msg.id2).first();
  //         if (node){
  //           self.producers.register(node.name);
  //         } else {
  //           deb("WARN  : eco.activate.EntityRenamed: id2 %s no ingame", msg.id);
  //         }
  //       });

  //       H.Events.on("Advance", function (msg){
  //         // works, but...
  //         if (self.orderqueue.delete(order => order.hcq === msg.data.technology)){
  //           self.producers.unqueue("research", msg.data.technology);
  //           deb("   ECO: onAdvance: removed order with tech: %s", msg.data.technology);
  //         }        
  //       });

  //       H.Events.on("ConstructionFinished", function (msg){
  //         self.producers.register(H.QRY("INGAME WITH id = " + msg.id).first().name);
  //         // H.Producers.loadById(msg.id);
  //       });

  //       H.Events.on("TrainingFinished", function (msg){

  //         deb("   ECO: TrainingFinished id: %s, meta: %s", msg.id, uneval(H.MetaData[msg.id]));

  //         node = H.QRY("INGAME WITH id = " + msg.id).first();
  //         if (node){
  //           self.producers.register(node.name);
  //         } else {
  //           deb("WARN  : eco.activate.TrainingFinished: id %s no ingame", msg.id);
  //         }

  //         // self.producers.register(H.QRY("INGAME WITH id = " + msg.id).first().name);
  //         // H.Producers.loadById(msg.id);
  //         self.producers.unqueue("train", msg.data.task); 

  //         order = H.Objects(msg.data.order);
  //         order.remaining  -= 1;
  //         order.processing -= 1;
          
  //         // H.Objects(order.source).listener("Ready", id);  
  //          H.Events.fire("OrderReady", {
  //           player: H.Bot.id,
  //           id:     msg.id,
  //           data:   {order: msg.data.order, source: order.source}
  //         });

  //       });

  //       H.Events.on("AIMetadata", function (msg){

  //         order = H.Objects(msg.data.order);
  //         order.remaining  -= 1;
  //         order.processing -= 1;

  //         deb("   ECO: on AIMetadata order: #%s from %s", order.id, H.Objects(order.source).name);
          
  //         // H.Objects(order.source).listener("Ready", id);  
  //         H.Events.fire("OrderReady", {
  //           player: H.Bot.id,
  //           id:     msg.id,
  //           data:   {order: msg.data.order, source: order.source}
  //         });

  //       });

  //       // H.Events.on("Advance", function (msg){
  //       //   self.producers.unqueue("research", msg.data.technology);  
  //       // });

  //       H.Events.on("Destroy", function (msg){
  //         self.producers.remove(msg.id);
  //         // deb("   ECO: got Event destroy for id: %s", msg.id);
  //       });


  //     },
  //     monitorGoals: function(){

  //     },
  //     getPhaseNecessities: function(context){ // phase, centre, tick
        
  //       var 
  //         cls = H.class2name,
  //         cc  = context.centre,
  //         housePopu = H.QRY(cls("house")).first().costs.population * -1,
          
  //         technologies = [],
  //         launches = {

  //           "phase.village": [

  //              //  tck, amount,       group,        params
  //              [   2, [1, "g.supplier",   {cc: cc, size: 4, resource: "food.fruit"}]],
  //              [   2, [1, "g.supplier",   {cc: cc, size: 1, resource: "food.meat"}]],
  //              [   2, [1, "g.supplier",   {cc: cc, size: 5, resource: "wood"}]],
  //              [   3, [1, "g.builder",    {cc: cc, size: 2, building: cls("house"),      quantity: 2}]],
  //              [   4, [1, "g.builder",    {cc: cc, size: 2, building: cls("farmstead"),  quantity: 1}]],
  //              [   4, [1, "g.builder",    {cc: cc, size: 2, building: cls("storehouse"), quantity: 1}]],
  //              [  10, [1, "g.harvester",  {cc: cc, size: 5}]],
  //              [  20, [1, "g.supplier",   {cc: cc, size: 5, resource: "stone"}]],
  //              [  30, [1, "g.supplier",   {cc: cc, size: 5, resource: "metal"}]],

  //           ],
  //           "phase.town" :   [
  //              [  10, [1, "g.supplier",   {cc: cc, size: 15, resource: "wood"}]],
  //              [  10, [1, "g.supplier",   {cc: cc, size: 15, resource: "stone"}]],
  //              [  10, [1, "g.supplier",   {cc: cc, size: 15, resource: "metal"}]],

  //           ],
  //           "phase.city" :   [

  //           ],
  //         };

  //       return {
  //         launches: launches,
  //         technologies: technologies,
  //         messages: messages,
  //       };

  //     },
  //     updateActions: function(phase){

  //       var 
  //         groups,
  //         ressTargets = {
  //           "food":  0,
  //           "wood":  0,
  //           "stone": 0,
  //           "metal": 0,
  //           "pop":   0,
  //         };

  //       deb();deb();deb("   ECO: updateActions phase: %s", phase);
  //       self.planner  = H.Brain.requestPlanner(phase);

  //       // deb("     E: planner.result.data: %s", uneval(planner.result.data));

  //       ressTargets.food  = self.planner.result.data.cost.food  || 0 + self.planner.result.data.ress.food;
  //       ressTargets.wood  = self.planner.result.data.cost.wood  || 0 + self.planner.result.data.ress.wood;
  //       ressTargets.metal = self.planner.result.data.cost.metal || 0 + self.planner.result.data.ress.metal;
  //       ressTargets.stone = self.planner.result.data.cost.stone || 0 + self.planner.result.data.ress.stone;

  //       deb("     E: ress: %s", uneval(ressTargets));

  //       goals = self.getActions(self.planner);

  //       groups = H.Brain.requestGroups(phase);
  //       groups.forEach(g => deb("     E: group: %s", g));

  //       groups.forEach(group => {
  //         var [count, name, cc, options] = group;
  //         H.extend(options, {name: name, cc: cc});
  //         H.loop(count, () => {
  //           H.Groups.launch(options);
  //         });
  //       });

  //       // H.Groups.log();

  //       deb("   ECO: updateActions -------");deb();

  //     },



// H.Economy.barter = function(source, sell, buy, amount){
//   var markets = gameState.getOwnEntitiesByType(gameState.applyCiv("structures/{civ}_market"), true).toEntityArray();
//   markets[0].barter(buy,sell,100);
//   Engine.PostCommand({"type": "barter", "sell" : sellType, "buy" : buyType, "amount" : amount });      
//   new api this.barterPrices = state.barterPrices;
// };

// logObject(sharedScript.playersData[this.id].statistics);
//   buildingsConstructed: NUMBER (0)
//   buildingsLost: NUMBER (0)
//   buildingsLostValue: NUMBER (0)
//   civCentresBuilt: NUMBER (0)
//   enemyBuildingsDestroyed: NUMBER (0)
//   enemyBuildingsDestroyedValue: NUMBER (0)
//   enemyCivCentresDestroyed: NUMBER (0)
//   enemyUnitsKilled: NUMBER (0)
//   enemyUnitsKilledValue: NUMBER (0)
//   percentMapExplored: NUMBER (3)
//   resourcesBought: OBJECT (food, wood, metal, stone, ...)[4]
//   resourcesGathered: OBJECT (food, wood, metal, stone, vegetarianFood, ...)[5]
//   resourcesSold: OBJECT (food, wood, metal, stone, ...)[4]
//   resourcesUsed: OBJECT (food, wood, metal, stone, ...)[4]
//   tradeIncome: NUMBER (0)
//   treasuresCollected: NUMBER (0)
//   tributesReceived: NUMBER (0)
//   tributesSent: NUMBER (0)
//   unitsLost: NUMBER (0)
//   unitsLostValue: NUMBER (0)
//   unitsTrained: NUMBER (0)

  

// Object: playersData  ---------------
//   0: OBJECT (name, civ, colour, popCount, popLimit, ...)[27]
//   1: OBJECT (name, civ, colour, popCount, popLimit, ...)[27]
//   2: OBJECT (name, civ, colour, popCount, popLimit, ...)[27]
//     cheatsEnabled: BOOLEAN (false)
//     civ: STRING (athen)
//     classCounts: OBJECT (Structure, ConquestCritical, Civic, Defensive, CivCentre, ...)[19]
//     colour: OBJECT (r, g, b, a, ...)[4]
//     entityCounts: OBJECT (Apadana, Council, DefenseTower, Embassy, Fortress, ...)[13]
//     entityLimits: OBJECT (Apadana, Council, DefenseTower, Embassy, Fortress, ...)[13]
//     heroes: ARRAY (, ...)[0]
//     isAlly: ARRAY (false, true, false, ...)[3]
//     isEnemy: ARRAY (true, false, true, ...)[3]
//     isMutualAlly: ARRAY (false, true, false, ...)[3]
//     isNeutral: ARRAY (false, false, false, ...)[3]
//     name: STRING (Player 1)
//     phase: STRING (village)
//     popCount: NUMBER (17)
//     popLimit: NUMBER (20)
//     popMax: NUMBER (300)
//     researchQueued: OBJECT (, ...)[0]
//     researchStarted: OBJECT (, ...)[0]
//     researchedTechs: OBJECT (phase_village, ...)[1]
//     resourceCounts: OBJECT (food, wood, metal, stone, ...)[4]
//     state: STRING (active)
//     statistics: OBJECT (unitsTrained, unitsLost, unitsLostValue, enemyUnitsKilled, enemyUnitsKilledValue, ...)[21]
//     team: NUMBER (-1)
//     teamsLocked: BOOLEAN (false)
//     techModifications: OBJECT (, ...)[0]
//     trainingBlocked: BOOLEAN (false)
//     typeCountsByClass: OBJECT (Structure, ConquestCritical, Civic, Defensive, CivCentre, ...)[19]


