/*jslint bitwise: true, browser: true, todo: true, evil:true, devel: true, debug: true, nomen: true, plusplus: true, sloppy: true, vars: true, white: true, indent: 2 */
/*globals HANNIBAL, deb, logObject, uneval */

/*--------------- C U L T U R E  ----------------------------------------------

  Models features of 0 A.D. civilisations as mesh network based on a triple store.
  

  tested with 0 A.D. Alpha 17 Quercus
  V: 0.1, agentx, CGN, NOV, 2014

*/


HANNIBAL = (function(H){

  H.LIB.Phases = function(context){

    H.extend(this, {

      name:     "phases",
      context:  context,
      imports:  [
        "phase",
        "query",
        "events",
        "culture",
        "templates",
        "techtemplates",
        "class2name",
      ],

      "1" : {idx: 1, abbr: "vill", next: "", generic: "phase_village", alternates: ["vill", "phase_village"]},
      "2" : {idx: 2, abbr: "town", next: "", generic: "phase_town",    alternates: ["town", "phase_town"]},
      "3" : {idx: 3, abbr: "city", next: "", generic: "phase_city",    alternates: ["city", "phase_city"]},
      current: "",

    });

  };

  H.LIB.Phases.prototype = {
    constructor: H.LIB.Phases,
    log: function(){
      deb();
      deb("PHASES: current: '%s'", this.current);
      deb("     P: 1: %s", JSON.stringify(this["1"]));
      deb("     P: 2: %s", JSON.stringify(this["2"]));
      deb("     P: 3: %s", JSON.stringify(this["3"]));
    },
    import: function(){
      this.imports.forEach(imp => this[imp] = this.context[imp]);
      return this;
    },
    serialize: function(){
      return {
        "1": this["1"],
        "2": this["2"],
        "3": this["3"],
        "current": this.current,
      };
    },
    deserialize: function(data){
      H.extend(this, data);  // just take 1,2,3, current
      return this;
    },
    initialize: function(){
      var test, self = this;
      function extract(str){
        if (str && str.contains("phase")){
          if (str.contains("village")){self["1"].alternates.push(str);}
          if (str.contains("town")){self["2"].alternates.push(str);}
          if (str.contains("city")){self["3"].alternates.push(str);}
        }
      }
      function check(key, tpl){
        if ((test = H.test(tpl, "Identity.RequiredTechnology"))){extract(test);}
        if ((test = H.test(tpl, "requirements.tech"))){extract(test);}
        if ((test = H.test(tpl, "requirements.any"))){test.filter(t => !!t.tech).forEach(t => extract(t.tech));}
      }
      if (this["1"].next === ""){
        H.each(this.templates, check); 
        H.each(this.techtemplates, check); 
        this["1"].alternates = H.unique(this["1"].alternates);
        this["2"].alternates = H.unique(this["2"].alternates);
        this["3"].alternates = H.unique(this["3"].alternates);
      }
      return this;
    },
    finalize: function(){
      this.current = this[this.phase].abbr;
      this.query(this.class2name("civilcentre") + " RESEARCH").forEach(node => {
        if (node.name.contains("town")){this["1"].next = node.name;}
        if (node.name.contains("city")){this["2"].next = node.name;}
      });
    },
    activate: function(){
      this.events.on("Advance", msg => {
        var phase;
        if ((phase = this.find(msg.data.key))){
          this.context.phase = phase.idx;
          this.current = phase.abbr;
          deb("PHASES: onAdvance: set new phase %s", this.current);
        }
      });      
    },
    prev: function(phase){return this[(this.find(phase).idx - 1) || 1];},
    find: function(phase){
      for (var i=1; i<=3; i++) {
        if (H.contains(this[i].alternates, phase)){
          return this[i];
        }
      } 
      return undefined; //H.throw("phases.find: '%s' unknown", phase);
    },

  };

  H.LIB.Tree = function(context){

    H.extend(this, {

      name:  "tree",
      context:  context,
      imports:  [
        "id",
        "player",
        "modifications",
        "culture",
        "query",
        "entities",
        "templates",
        "techtemplates",
        "operators",
      ],

      nodes:      null,
      sources:    null,
      names:      null,
      keys:       null,
      cntSources: 0,

    });

  };

  H.LIB.Tree.prototype = {
    constructor: H.LIB.Tree,
    log: function(){
      deb(); deb("  TREE: expanded %s sources into %s nodes", this.cntSources, H.count(this.nodes));
    },
    import: function(){
      this.imports.forEach(imp => this[imp] = this.context[imp]);
      return this;
    },
    deserialize: function(data){
      this.nodes = data;
      return this;
    },
    serialize: function(){

      var data = {};

      H.each(this.nodes, (nodename, node) => {

        data[nodename] = {};
        H.each(node, (propname, prop) => {

          if (propname === "template"){
            // API object
            data[nodename].template = null;

          } else if (propname === "producers"){
            // triples
            data[nodename].producers = {};
            H.each(prop, (producername) => {
              data[nodename].producers[producername] = null;
            });

          } else if (propname === "products"){
            // triples
            data[nodename].products = {count: prop.count, train: {}, build: {}, research: {}};
            H.each(prop.train, (productname) => {
              data[nodename].products.train[productname] = null;
            });
            H.each(prop.build, (productname) => {
              data[nodename].products.build[productname] = null;
            });
            H.each(prop.research, (productname) => {
              data[nodename].products.research[productname] = null;
            });

          } else {
            // primitives
            data[nodename][propname] = prop;

          }

        });

      });

      return data;

    },
    initialize: function(){

      this.civ = this.player.civ;

      if (this.nodes === null){

        this.nodes = {};

        this.sources = [].concat(
          H.attribs(this.player.researchedTechs), 
          H.attribs(this.modifications[this.id]),
          H.attribs(this.entities)
            .filter(id => this.entities[id].owner() === this.id)
            .map(id => this.entities[id]._templateName)
        );    

        this.sources = H.unique(this.sources).map(src => [0, src]);
        this.cntSources = this.sources.length;
        this.build();
        this.names = H.attribs(this.nodes);
        this.keys  = H.attribs(this.nodes).map(t => this.nodes[t].key);

        // deb("     T: found %s nodes", this.names.length);

      }

      return this;

    },
    finalize: function(){

      // after initialize AND deserialize

      var 
        tech, name, producers, nodes = this.nodes, t0 = Date.now(),
        phases = this.culture.phases,
        operMapper = {
          "BUILDBY":       "build_structures",
          "TRAINEDBY":     "train_units",
          "RESEARCHEDBY":  "research_tech"
        },
        verbMapper = {
          "BUILD":    "BUILDBY",
          "TRAIN":    "TRAINEDBY",
          "RESEARCH": "RESEARCHEDBY"
        };

      this.query("ENABLE DISTINCT").forEach(node => {
        tech = this.query(node.name + " REQUIRE").first().name;
        nodes[node.name].requires = tech;
      });

      // uplink info, producer

      "TRAIN BUILD RESEARCH".split(" ").forEach(verb => {
        this.query(verb + " DISTINCT").forEach(ent => {
          this.query(ent.name + " " + verbMapper[verb]).forEach(p => {
            nodes[ent.name].producers[p.name] = p;
          });
          nodes[ent.name].verb = verb.toLowerCase();
          nodes[ent.name].operator = this.operators[operMapper[verbMapper[verb]]];
        });
      });  

      this.query("PAIR DISTINCT").forEach(tech => {  
        this.query(tech.name + " PAIREDBY RESEARCHEDBY").forEach(p => {
          nodes[tech.name].producers[p.name] = p;
        });
        nodes[tech.name].verb = "research";
        nodes[tech.name].operator = this.operators.research_tech;
      });          

      this.query("SUPERSEDE DISTINCT").forEach(tech => {  
        this.query(tech.name + " SUPERSEDEDBY RESEARCHEDBY").forEach(p => {
          nodes[tech.name].producers[p.name] = p;
        });
        nodes[tech.name].verb = "research";
        nodes[tech.name].operator = this.operators.research_tech;
      });          

      // downlink info, products

      H.each(nodes, (name /*, node */) => {
        nodes[name].products.count = 0; // 
        "TRAIN BUILD RESEARCH".split(" ").forEach(verb => {
          this.query(name + " " + verb).forEach(p => {
            nodes[name].products.count += 1;
            nodes[name].products[verb.toLowerCase()][p.name] = p;
          });
        });
      });

      this.query("RESEARCHEDBY DISTINCT").forEach(researcher => {  
        this.query(researcher.name + " RESEARCH PAIR").forEach(p => {
          if (!nodes[researcher.name].products.research[p.name]){
            nodes[researcher.name].products.research[p.name] = p;
            nodes[researcher.name].products.count += 1; // H.count(nodes[researcher.name].products.research);
          }
        });
      });          

      this.query("RESEARCHEDBY DISTINCT").forEach(researcher => {  
        this.query(researcher.name + " RESEARCH SUPERSED").forEach(p => {
          if (!nodes[researcher.name].products.research[p.name]){
            nodes[researcher.name].products.research[p.name] = p;
            nodes[researcher.name].products.count += 1; // H.count(nodes[researcher.name].products.research);
          }
        });
      });          


      // setting research as verb for all phase alternatives

      // H.range(1, 4).forEach(n => {
      H.loop(3, n => {
        phases[n].alternates.forEach(a => {
          name = H.saniTemplateName(a);
          if (nodes[name] && !nodes[name].verb){
            nodes[name].verb = "research";
          }
        });
      });

      // setting producers for all phase alternatives

      H.loop(3, n => {
        producers = null;
        phases[n].alternates.forEach(a => {
          name = H.saniTemplateName(a);
          if (nodes[name] && H.count(nodes[name].producers)){
            producers = nodes[name].producers;
          }
        });
        // deb("  TREE: phase: %s, producers: %s", phases[n].abbr, uneval(producers));
        phases[n].alternates.forEach(a => {
          name = H.saniTemplateName(a);
          if (nodes[name] && !H.count(nodes[name].producers)){
            // nodes[name].producers = H.deepcopy(producers);
            nodes[name].producers = producers;
            // deb("tree: set %s", name);
          }
        });
      });

      // setting max resource flow for all trainer

      H.each(nodes, (name, node) => {
        node.flow = ( H.count(node.products.train) ?
          this.getFlowFromTrainer(name) :
          null
        );
      });

      // last time was 254 ms and 125 nodes on brain/athen 
      // deb();deb("  TREE: finalized %s msecs, %s nodes", Date.now() - t0, H.count(nodes));

    },
    getFlowFromClass: function(klass){

      return H.attribs(this.nodes[this.class2name(klass)].products.train)
        .map(name => this.query(name).first().costs)
        .map(costs => H.cost2flow(costs))
        .reduce(H.maxFlow, {food:0,wood:0,stone:0,metal:0});
    },

    getFlowFromTrainer: function(name){

      return H.attribs(this.nodes[name].products.train)
        .map(name => this.query(name).first().costs)
        .map(costs => H.cost2flow(costs))
        .reduce(H.maxFlow, {food:0,wood:0,stone:0,metal:0});
    },
    getType: function(tpln){

      return (
        this.techtemplates[tpln]      ? "tech" :
        tpln.contains("units/")       ? "unit" :
        tpln.contains("structures/")  ? "stuc" :
        tpln.contains("other/")       ? "othr" :
        tpln.contains("gaia/")        ? "gaia" :
        tpln.contains("pair_/")       ? "pair" :
          "XXXX"
      );

    },
    getPhase: function(tpln, space){

      var 
        test, 
        phases = this.culture.phases,
        phase = "phase_village", tpl = this.templates[tpln] || this.techtemplates[tpln];

      space = space || ""; // deb

      if ((test = H.test(tpl, "Identity.RequiredTechnology"))){
        phase = test;
      } else if ((test = H.test(tpl, "requirements.any"))){
        phase = test[0].tech;
      } else if ((test = H.test(tpl, "requirements.tech"))){
        phase = test;
      } else if (phases.find(tpln)){
        phase = phases.prev(tpln).generic;
      } else if (tpl.top) {
        return this.getPhase(tpl.top, space + "  ");
      }

      // deb("     P:%s %s -> %s", space, tpln, phase);

      if (!phases.find(phase)){
        return this.getPhase(phase, space + "  ");
      } else {
        return phase;
      }


    },
    build: function (){

      // picks from sources, analyzes, and appends branches to sources
      // thus traversing the tree

      var 
        tpln, key, tpl, name, src, test, depth = 0,
        phases = this.culture.phases,
        push = item => this.sources.push([depth, item]);

      H.consume(this.sources, src => {

        tpln = src[1];
        key  = tpln.replace(/\{civ\}/g, this.civ);
        tpl  = this.templates[key] || this.techtemplates[key];
        name = H.saniTemplateName(key);

        if (!this.nodes[name]){

          this.nodes[name] = {
            name:          name,     // sanitized API template name
            key:            key,     // API template name
            type:            "",     // tech, unit, stuc
            template:       tpl,     // API template
            depth:       src[0],     // local depth
            operations:       0,     // planning depth, set in HTN.Economy
            order:            0,     // execution order, set in HTN.Economy
            phase:           "",     // vill, town, city
            requires:        "",     // sanitized tech template name
            producers:       {},     // {name: node, }
            verb:            "",     // train, build, research // uplink
            products: {              // downlink
              count:          0,     // amount of products
              train:         {},     // {name: node, }
              build:         {}, 
              research:      {}
            }, 
            operator:      null,    // planner.operator
          };

          // unit promotion
          if(key.slice(-2) === "_b"){
            push(key.slice(0, -2) + "_e");
            push(key.slice(0, -2) + "_a");
          }

          // can research tech
          if ((test = H.test(tpl, "ProductionQueue.Technologies._string"))){
            test.split(" ").forEach(push);
          }

          // can train ents
          if ((test = H.test(tpl, "ProductionQueue.Entities._string"))){
            test.split(" ").forEach(push);
          }

          // can build structs
          if ((test = H.test(tpl, "Builder.Entities._string"))){
            test.split(" ").forEach(push);
          }

          // needs tech
          if ((test = H.test(tpl, "Identity.RequiredTechnology"))){
            push(test);
          }

          // is tech
          if (tpl.supersedes){push(tpl.supersedes);}
          if (tpl.bottom){push(tpl.bottom);}
          if (tpl.top){push(tpl.top);}

          depth += 1;

        }

      });

      H.each(this.nodes, (name, node) => {
        node.type  = this.getType(node.key);
        node.phase = phases.find(this.getPhase(node.key)).abbr;
      });

    },

  };    

  H.LIB.Culture = function(context){

    H.extend(this, {

      name:    "culture",
      context: context,
      imports: [
        "id",
        "player",
        "query",
        "entities",
        "metadata",
        "events",
        "templates",
        "techtemplates",
      ],
      childs: [
        "store",
        "phases",
        "tree",
      ],

      civ :   "",
      tree:   null,
      store:  null,
      phases: null,

      verbs: H.Data.verbs,

      // stores nodes found in templates
      classes:       [],
      technologies:  [],
      resources:     [],
      resourcetypes: [],

      cntIngames:    0,
      cntNodes:      0,
      cntEdges:      0,

    });

  };

  H.LIB.Culture.prototype = {
    constructor: H.Culture,
    log: function (){
      deb();
      deb("  CULT: civ: %s, templates: %s, %s verbs, %s nodes, %s edges, %s ingames", 
        this.civ,
        H.count(this.templates),
        this.verbs.length,
        this.cntNodes,
        this.cntEdges,
        this.cntIngames
      );
      this.query("INGAME SORT < id").execute("metadata", 5, 80, "culture.log: ingames with metadata");
      this.phases.log();
      this.tree.log();
      this.store.log();

    },
    import: function (){
      this.imports.forEach(imp => this[imp] = this.context[imp]);
      return this;
    },
    clone: function (context){
      return new H.LIB[H.noun(this.name)](context);
    },
    serialize: function(){
      return {
        tree:   this.tree.serialize(),
        store:  this.store.serialize(),
        phases: this.phases.serialize(),
      };
    },
    deserialize: function(){
      if (this.context.data[this.name]){
        this.childs.forEach( child => {
          if (this.context.data[this.name][child]){
            this[child] = new H.LIB[H.noun(child)](this.context)
              .import()
              .deserialize(this.context.data[this.name][child]);
          }
        });
      }
    },
    finalize: function (){

      H.each(this.store.nodes, (name, node) => {
        delete this.store.nodes[name].template;
        delete this.store.nodes[name].classes;
      });

      this.childs.forEach( child => {
        if (this[child].finalize){
          this[child].finalize();
        }
      });

    },
    initialize: function (){

      this.civ = this.player.civ; 

      if (!this.phases){
        this.phases = new H.LIB.Phases(this.context)
          .import()
          .initialize();
      }

      if (!this.tree){
        this.tree = new H.LIB.Tree(this.context)
          .import()
          .initialize();
      }

      if (!this.store){
        this.store = new H.LIB.Store(this.context)
          .import()
          .initialize();

        this.searchTemplates();          // extrcact classes, resources, etc from templates
        this.loadNodes();                // turn templates to nodes
        this.loadEdges();                // add edges
        this.loadEntities();             // from game to triple store
        this.loadTechnologies();         // from game to triple store

      }

      H.each(this.store.nodes, (name, node) => {
        this.addNodeDynaProps(node);
      });

    },
    activate: function (){

      this.events.on("TrainingFinished", msg => {
        this.loadById(msg.id);
      });

      this.events.on("EntityRenamed", msg => {
        this.loadById(msg.id2);
        H.Triggers.add(-1, this.removeById.bind(this, msg.id));
        // this.removeById(msg.id);
      });

      this.events.on("AIMetadata", msg => {
        this.loadById(msg.id);
      });

      this.events.on("Destroy", msg => {
        if (!msg.data.foundation){
          this.removeById(msg.id);
        }
      });

      this.events.on("Advance", this.tree.id, msg => {
        // this.loadByName(msg.data.technology);
      });

    },

    loadNodes: function(){

      var 
        self  = this, node, name, template, 
        sani  = H.saniTemplateName,
        counter = 0, counterTechs = 0, counterUnits = 0, counterStucs = 0,
        conf  = {
          "classes":        {deb: false, generic: "Class",         tooltip: "a class"},
          "resources":      {deb: false, generic: "Resource",      tooltip: "something to gather"},
          "resourcetypes":  {deb: false, generic: "ResourceType",  tooltip: "something to drop elsewhere"}
        };

      H.each(conf, function(type, conf){

        // load nodes collected in readTemplates

        self[type].forEach(function(tpln){

          name = sani(tpln);
          template = {Identity: {GenericName: conf.generic, Tooltip: conf.tooltip}};

          if (type === "classes" && H.Data.ClassInfo[name]){
            template.Tooltip = H.Data.ClassInfo[name];
          }

          node = self.addNode(name, tpln, template);
          counter += 1;     

          if (conf.deb){deb("     C: Node added: %s for %s", name, type);}

        });

        // deb("     C: created %s nodes for %s", H.tab(self[type].length, 4), type);

      });

      // load nodes collected in selectTemplates
      H.each(this.tree.nodes, function (name, template){
        counterTechs += template.type === "tech" ? 1 : 0;
        counterStucs += template.type === "stuc" ? 1 : 0;
        counterUnits += template.type === "unit" ? 1 : 0;
        node = self.addNode(template.name, template.key, template.template);
      });

      // deb("     C: created %s nodes for units", H.tab(counterUnits, 4));
      // deb("     C: created %s nodes for structures", H.tab(counterStucs, 4));
      // deb("     C: created %s nodes for technologies", H.tab(counterTechs, 4));

    },
    searchTemplates: function(){

      // searches for classes, resources and resourcetypes

      var list, tpl, self = this;

      H.each(this.tree.nodes, function(name, node){

        tpl = node.template;

        // classes
        if (tpl.Identity && tpl.Identity.VisibleClasses){
          list = tpl.Identity.VisibleClasses._string.toLowerCase();
          list = H.replace(list, "\n", " ");
          list.split(" ")
            .filter(klass => !!klass)
            .filter(klass => klass[0] !== "-") // ??
            .forEach(klass => self.classes.push(klass));
        }

        // more classes
        if (tpl.Identity && tpl.Identity.Classes){
          list = tpl.Identity.Classes._string.toLowerCase();
          list = H.replace(list, "\n", " ");
          list.split(" ")
            .filter(klass => !!klass)
            .filter(klass => klass[0] !== "-") //??
            .forEach(klass => self.classes.push(klass));
        }

        // even more classes
        if (tpl.GarrisonHolder && tpl.GarrisonHolder.List){
          tpl.GarrisonHolder.List._string.split(" ").forEach(function(klass){
            self.classes.push(klass.toLowerCase());
          });
        }

        // resources [wood.ruins]
        if (tpl.ResourceSupply && tpl.ResourceSupply.Type){
          self.resources.push(tpl.ResourceSupply.Type);
        }
        
        if (tpl.ResourceGatherer && tpl.ResourceGatherer.Rates){
          H.attribs(tpl.ResourceGatherer.Rates).forEach(function(resource){
            self.resources.push(resource);
          });
        }

        // resources type
        if (tpl.ResourceDropsite && tpl.ResourceDropsite.Types){
          tpl.ResourceDropsite.Types.split(" ").forEach(function(type){
            self.resourcetypes.push(type);
          });
        }

      });

      this.classes = H.unique(this.classes.sort());
      this.resources = H.unique(this.resources.sort());
      this.resourcetypes = H.unique(this.resourcetypes.sort());

    },
    loadEntities: function(){

      var 
        targetNodes = [], cntEdges = 0, key, name, 
        nodeSource, nodeSourceName, 
        sani = H.saniTemplateName;

      // deb();deb("     C: loadEntities from game: %s total", H.count(this.entities));

      H.each(this.entities, (id, ent) => {

        key  = ent._templateName;
        name = sani(key) + "#" + id;

        if (ent.owner() === this.id){
          targetNodes.push(this.addNode(name, key, ent._template, ~~id));
          this.cntIngames += 1;
        }

      });

      targetNodes.forEach( nodeTarget => {

        nodeSourceName = nodeTarget.name.split("#")[0];
        nodeSource = this.store.nodes[nodeSourceName];

        if (!nodeSource){deb("ERROR : loadEntities nodeSource: %s", nodeSourceName);}
        if (!nodeTarget){deb("ERROR : loadEntities nodeTarget: %s", nodeTarget.name);}

        this.store.addEdge(nodeSource, "ingame",      nodeTarget);
        this.store.addEdge(nodeTarget, "describedby", nodeSource);

        this.cntEdges += 2;

      });

      // deb("     C: created %s nodes for game entities", H.tab(this.cntIngames, 4));
      // deb("     C: created %s edges for game entities", H.tab(this.cntEdges, 4));      

    },
    loadTechnologies: function(){

      var 
        store = this.store, 
        techs = this.player.researchedTechs,
        sani  = H.saniTemplateName,
        counter = 0, nameSource, nameTarget, nodeSource, nodeTarget, names = [];

      // TODO: Can tech be INGAME ???

      H.each(techs, (key, tech) => {

        nameTarget = sani(key);

        nameSource = H.format("%s#T", nameTarget);
        names.push(nameTarget);

        nodeTarget = store.nodes[nameTarget];
        nodeSource = this.addNode(nameSource, key, tech);
        
        store.addEdge(nodeSource, "techdescribedby", nodeTarget);
        store.addEdge(nodeTarget, "techingame",      nodeSource);
        
        this.cntEdges += 2;
        counter += 1;

      });

      // deb("     C: loaded %s nodes %s edges as tech: [%s]", H.tab(counter, 4), counter*2, names);  


    },
    loadById: function(id){

      // called by events

      var 
        sani = function(name){
          name = H.replace(name,  "_", ".");
          name = H.replace(name,  "|", ".");
          name = H.replace(name,  "/", ".").toLowerCase();
          // HACK: foundations
          if (name.split(".")[0] === "foundation"){
            name = name.split(".").slice(1).join(".");
          }
          return name;
        },
        ent  = this.entities[id],
        key  = ent._templateName,
        nameSource = sani(ent._templateName),
        nameTarget = nameSource + "#" + id,
        nodeTarget = this.addNode(nameTarget, key, ent._template, id),
        nodeSource = this.store.nodes[nameSource];

      this.store.addEdge(nodeSource, "ingame",      nodeTarget);
      this.store.addEdge(nodeTarget, "describedby", nodeSource);
      this.addNodeDynaProps(nodeTarget);

      // deb("  CULT: loadById %s <= %s", nameTarget, nameSource);

    },
    removeById: function(id){
      
      var 
        node = this.query("INGAME WITH id = " + id).first(), 
        ent  = this.entities[id],
        tpln = ent ? ent._templateName : "unknown";

      if (node){
        H.delete(this.store.edges, edge => edge[0] === node || edge[2] === node);
        delete this.store.nodes[node.name];

      } else {
        deb("WARN  : culture.removeById failed on id: %s, tpl: %s", id, tpln);
        this.query("INGAME SORT < id").execute("metadata", 5, 50, "removeById: ingames with metadata");

      }

    },
    addNode: function(name, key, template, id){

      var 
        node = {
          name      : name,
          key       : key,
          template  : template  //TODO: remove this dependency
        },
        properties = {
          id        : ~~id || undefined,
          civ       : H.test(template, "Identity.Civ"), // this.getCivilisation(template),
          info      : this.getInfo(template),
          icon      : (!!template.Identity && template.Identity.Icon) ? template.Identity.Icon : undefined,       // tech
          size      : this.getSize(template),
          costs     : this.getCosts(template),
          speed     : this.getSpeed(template),
          armour    : this.getArmour(template),
          rates     : this.getRates(template),
          health    : this.getHealth(template), //TODO: ingames
          vision    : this.getVision(template),
          attack    : this.getAttack(template),
          affects   : this.getAffects(template),
          capacity  : this.getCapacity(template),
          requires  : this.getRequirements(template),     // tech
          autoresearch : (!!template.autoResearch ? template.autoResearch : undefined),       // tech
          modifications: H.test(template, "modifications"), //this.getModifications(template),
        };

      // create only props with value
      H.each(properties, function(prop, value){
        if(value !== undefined){
          node[prop] = value;
        }
      });

      this.store.addNode(node);
      this.cntNodes += 1;

      // deb("  CULT: addNode: %s, id: %s", node.name, id);

      return node;

    },    
    delNodeDynaProps: function(node){
      var props = [
        "position",
        "metadata",
        "slots",
        "state",
        "health"
      ];
      return H.dropcopy(node, props);
    },
    addNodeDynaProps: function(node){

      var id = node.id, metadata  = this.metadata, entities = this.entities; // CLOSURE !!

      // deb("  CULT: addNodeDynaProps: %s, %s", node.id, node.name);

      Object.defineProperties(node, {
        "position": {enumerable: true, get: function(){
          var pos = entities[id].position();
          return pos;
        }},
        "metadata": {enumerable: true, get: function(){
          var meta = metadata[id];
          return (meta === Object(meta)) ? meta : {};
        }},
        "slots": {enumerable: true, get: function(){
          if (!node.capacity){
            deb("WARN  : node.slots on invalid id: %s, tpl: %s", id, entities[id].templateName() || "???");
            return undefined;
          }
          var freeSlots = node.capacity - entities[id].garrisoned.length;
          return freeSlots;
        }},          
        "state": {enumerable: true, get: function(){
          var state = entities[id].unitAIState().split(".").slice(-1)[0].toLowerCase();
          return state;
        }},
        "health": {enumerable: true, get: function(){
          var ent = entities[id];
          return Math.round(ent.hitpoints() / ent.maxHitpoints()); // propbably slow
        }}
      });
    },
    logNode: function(node){
      deb("    %s", node.name);
      deb("      : key  %s", node.key);
      deb("      : type %s", node.type);
      deb("      : desc %s", node.description);
      deb("      : clas %s", node.classes.join(", "));
      if (node.costs)   {deb("      :   cost:   %s", H.prettify(node.costs));}
      if (node.armour)  {deb("      :   armour: %s", H.prettify(node.armour));}
      if (node.health)  {deb("      :   health: %s", node.health);}
      if (node.capacity){deb("      :   capacity: %s", node.capacity);}
      if (node.requires){deb("      :   requires: %s", node.requires);}
    },
    getAttack: function(/* template */){

      // var ta = template.attack;
      // if (ta)
      // <Attack>
        // <Melee>
          // <Hack>40.0</Hack>
          // <Pierce>0.0</Pierce>
          // <Crush>0.0</Crush>
          // <MaxRange>5.0</MaxRange>
          // <RepeatTime>1500</RepeatTime>
        // </Melee>
        // <Charge>
          // <Hack>120.0</Hack>
          // <Pierce>0.0</Pierce>
          // <Crush>0.0</Crush>
          // <MaxRange>5.0</MaxRange>
          // <MinRange>0.0</MinRange>
        // </Charge>
        // <Slaughter>
        //   <Hack>25.0</Hack>
        //   <Pierce>0.0</Pierce>
        //   <Crush>0.0</Crush>
        //   <MaxRange>4.0</MaxRange>
        // </Slaughter>        
      // </Attack>    
    },
    getModifications: function(template){
      // "modifications": [
      //     {"value": "ResourceGatherer/Rates/food.grain", "multiply": 15, "affects": "Spearman"},
      //     {"value": "ResourceGatherer/Rates/food.meat", "multiply": 10}
      // ],      
      return template.modifications || undefined;
    },
    getRequirements: function(t){
      // "requirements": { "class": "Village", "numberOfTypes": 2 },
      // "requirementsTooltip": "Requires two village structures", 
      var tr = t.requirements;
      if (tr){
        if (tr.tech){
          return {tech: H.saniTemplateName(tr.tech)};
        } else if (tr.class) {
          return {class: H.saniTemplateName(tr.class), number: tr.number};
        } else if (tr.any) {
          return {any: tr.any}; //TODO: sani techs
        }
      }
      return t.requirements || undefined;
    },    
    getAffects: function(t){
      return !!t.affects ? !t.affects.map(String.toLowerCase) : undefined;
    },
    getType: function(template, type){
      type = [type];
      if (template.Identity !== undefined){
        if (template.Identity.GenericName !== undefined){
          type.push(template.Identity.GenericName);
        }
        if (template.Identity.SpecficName !== undefined){
          type.push(template.Identity.SpecificName);
        }
      }
      return type.join("|");
    },
    getInfo: function(t){

      var tip;

      return (
        (tip = H.test(t, "Identity.Tooltip")) ? H.replace(tip, "\n", " ") :
        (tip = H.test(t, "tooltip"))     ? tip :
        (tip = H.test(t, "description")) ? tip :
        (tip = H.test(t, "top"))         ? t.genericName :
        (tip = H.test(t, "genericName")) ? tip :
          undefined
      );

      // if (t.Identity !== undefined){
      //   if (t.Identity.Tooltip){
      //     tip = H.replace(t.Identity.Tooltip, "\n", " ");
      //   }
      // } else if (t.tooltip !== undefined) {
      //   tip = t.tooltip;
      // } else if (t.description) {
      //   tip = t.description;
      // } else if (t.top) { // pair
      //   tip = t.genericName;
      // } else if (t.genericName) { // phase.city
      //   tip = t.genericName;
      // }
      // return tip;
    }, 
    getCivilisation: function(t){
      // return H.test(t, "Identity.Civ")
      var civ;
      if (t.Identity !== undefined){
        if (t.Identity.Civ){
          civ = t.Identity.Civ;
        }
      }
      return civ;
    },
    // getRequirements: function(template){
      //   var requirement;
      //   if (template.Identity !== undefined){
      //     if (template.Identity.RequiredTechnology){
      //       requirement = template.Identity.RequiredTechnology;
      //     }
      //   }    
      //   return requirement;
      // },
    getHealth: function(t){
      var test;
      return (test = H.test(t, "Health.Max")) ? ~~test : undefined;
      //   (!!tpl.Health && ~~tpl.Health.Max) ? 
      //     ~~tpl.Health.Max : 
      //       undefined
      // );
    },
    getRates: function(tpl){
      // <ResourceGatherer>
      //   <MaxDistance>2.0</MaxDistance>
      //   <BaseSpeed>1.0</BaseSpeed>
      //   <Rates>
      //     <food.fruit>1</food.fruit>
      //     <food.grain>0.5</food.grain>
      //     <food.meat>1</food.meat>
      //     <wood.tree>0.7</wood.tree>
      //     <wood.ruins>5</wood.ruins>
      //     <stone.rock>0.5</stone.rock>
      //     <stone.ruins>2</stone.ruins>
      //     <metal.ore>0.5</metal.ore>
      //   </Rates>
      // </ResourceGatherer>      
      var rates = {}, has = false, speed, tr;
      if (!!tpl.ResourceGatherer && !!tpl.ResourceGatherer.Rates){
        speed = parseFloat(tpl.ResourceGatherer.BaseSpeed);
        tr = tpl.ResourceGatherer.Rates;
        H.each(tr, function(res, rate){
          has = true;
          if (res.contains(".")){
            var [p1, p2] = res.split(".");
            if (!rates[p1]){
              rates[p1] = {};
            }
            rates[p1][p2] = parseFloat(rate) * speed;

          } else {
            rates[res] = parseFloat(rate) * speed;
          }
        });
        // deb("rates: tpl: %s", tpl.Identity.GenericName, JSON.stringify(rates));
      }
      return has ? rates : undefined;
    },
    getSize: function(tpl){
      var size = {}; // {width: 0, depth: 0};
      if (tpl.Footprint){
        if (tpl.Footprint.Square) {
          if (tpl.Footprint.Square["@width"]){size.width = tpl.Footprint.Square["@width"];}
          if (tpl.Footprint.Square["@depth"]){size.depth = tpl.Footprint.Square["@depth"];}
        }
        if (tpl.Footprint.Circle && tpl.Footprint.Circle["@radius"]){
          size.radius = tpl.Footprint.Circle["@radius"];
        } else {
          size.radius = (Math.sqrt(size.width*size.width + size.depth*size.depth) / 2).toFixed(2);
        }
        // deb("      : square %s, tpl: %s, size: %s", uneval(tpl.Footprint.Square), tpl._templateName, uneval(size));
      }
      return H.count(size) > 0 ? size : undefined;
    },
    getSpeed: function(t){
      var test;
      return (test = H.test(t, "UnitMotion.WalkSpeed")) ? ~~test : undefined;
      // return (
      //   (!!tpl.UnitMotion && ~~tpl.UnitMotion.WalkSpeed) ? 
      //     ~~tpl.UnitMotion.WalkSpeed : 
      //       undefined
      // );
    },   
    getVision: function(t){
      var test;
      return (test = H.test(t, "Vision.Range")) ? ~~test : undefined;
      // return (
      //   (!!tpl.Vision && ~~tpl.Vision.Range) ? 
      //     ~~tpl.Vision.Range : 
      //       undefined
      // );
    },
    getCapacity: function(t){
      var test;
      return (test = H.test(t, "GarrisonHolder.Max")) ? ~~test : undefined;
      // return (
      //   (!!tpl.GarrisonHolder && ~~tpl.GarrisonHolder.Max) ? 
      //     ~~tpl.GarrisonHolder.Max : 
      //       undefined
      // );
    },
    getArmour: function(t){
      var armour = {}; // {hack: 0, pierce: 0, crush: 0};
      if (t.Armour !== undefined){
        if (~~t.Armour.Hack)  {armour.hack   = ~~t.Armour.Hack;}
        if (~~t.Armour.Pierce){armour.pierce = ~~t.Armour.Pierce;}
        if (~~t.Armour.Crush) {armour.crush  = ~~t.Armour.Crush;}
      }
      return H.count(armour) > 0 ? armour : undefined;
    },
    getCosts: function(t){
      // we want integers
      var has = false, costs = {population: 0, time: 0, food:0, wood: 0, stone: 0, metal: 0},
          TC = t.Cost, // ents
          tc = t.cost; // tech
      if (TC !== undefined){
        has = true;
        costs.population = ~~TC.Population || -~~TC.PopulationBonus || 0;
        // if (TC.Population)       {costs.population =  ~~TC.Population;} 
        // if (TC.PopulationBonus)  {costs.population = -~~TC.PopulationBonus;} 
        if (TC.BuildTime)        {costs.time       =  ~~TC.BuildTime;}
        if (TC.ResearchTime)     {costs.time       =  ~~TC.ResearchTime;}
        if (TC.Resources){
          if (TC.Resources.food) {costs.food  = ~~TC.Resources.food;} 
          if (TC.Resources.wood) {costs.wood  = ~~TC.Resources.wood;} 
          if (TC.Resources.metal){costs.metal = ~~TC.Resources.metal;}
          if (TC.Resources.stone){costs.stone = ~~TC.Resources.stone;}
        }
      } else if (tc !== undefined) {
        has = true;
        if (tc.food) {costs.food  = ~~tc.food;} 
        if (tc.wood) {costs.wood  = ~~tc.wood;} 
        if (tc.metal){costs.metal = ~~tc.metal;}
        if (tc.stone){costs.stone = ~~tc.stone;}
      }

      if (t.researchTime){
        costs.time =  ~~t.researchTime;
        has = true;
      }

      return has ? costs : undefined;

    },
    createEdges: function(verb, inverse, msg, test, targets, debug){

      var store = this.store, nodeTarget, counter = 0;

      debug = debug || false;

      H.each(store.nodes, (name, nodeSource) => {
        if (test(nodeSource)){
          if (debug){deb("     C: Edge.%s test: %s", verb, name);}
          targets(nodeSource).forEach( nameTarget => {
            nodeTarget = store.nodes[nameTarget];
            if (nodeTarget){
              store.addEdge(nodeSource, verb,    nodeTarget);
              store.addEdge(nodeTarget, inverse, nodeSource);
              this.cntEdges += 2;
              counter += 1;
              if (debug){deb("     C: Edge.%s:      -> %s", verb, nodeTarget.name);}
            } else {
              deb("ERROR : createEdges: verb: %s, no node for %s <= %s", verb, nameTarget, nodeSource.name);
            }
          });
        }
      });

      // deb("     C: created %s edges on pair: %s|%s - %s", H.tab(counter*2, 4), verb, inverse, msg);

    },        
    loadEdges: function(){

      // Entities member classes

      var sani = H.saniTemplateName;

      this.createEdges("supersede", "supersededby", "a tech order",
        function test(node){
          return !!node.template.supersedes;
        }, 
        function target(node){
          return [sani(node.template.supersedes)];
        }, false
      );

      this.createEdges("pair", "pairedby", "pair pairs two techs",
        function test(node){
          return !!node.template.top &&!!node.template.bottom;
        }, 
        function target(node){
          return [sani(node.template.top), sani(node.template.bottom)];
        }, false
      );

      this.createEdges("member", "contain", "Entities member/contain classes",
        function test(node){
          var identity = node.template.Identity;
          return !!identity && (
                 (!!identity.VisibleClasses &&identity.VisibleClasses._string !== undefined ) || 
                 (!!identity.Classes && identity.Classes._string !== undefined)
                 );
        }, 
        function target(node){
          var identity = node.template.Identity, classes = "";
          if (identity.VisibleClasses){classes += identity.VisibleClasses._string;}
          if (identity.Classes){classes += " " + identity.Classes._string;}
          classes = H.replace(classes, "\n", " ").toLowerCase();
          classes = classes.split(" ")
            .filter(klass => !!klass)
            .filter(klass => klass[0] !== "-");
          return H.unique(classes);
        }, false
      );


      // Entities provide resources

      this.createEdges("provide", "providedby", "entities provide resources",
        // gaia.special.ruins.stone.statues.roman -> stone.ruins
        function test(node){
          return node.template.ResourceSupply && 
                 node.template.ResourceSupply.Type;
        }, 
        function target(node){
          return [node.template.ResourceSupply.Type];
        }, false
      );


      // Entities gather resources

      this.createEdges("gather", "gatheredby", "entities gather resources",
        function test(node){
          return  !!node.template.ResourceGatherer &&
                  node.template.ResourceGatherer.Rates !== undefined;
        }, 
        function target(node){
          return H.attribs(node.template.ResourceGatherer.Rates).sort();
        }, false
      );


      // Entities build Entities (mind {civ})

      this.createEdges("build", "buildby", "entities build entities",
        // units.athen.infantry.spearman.a -> structures.athen.defense.tower
        function test(node){
          return  !!node.template.Builder && 
                  !!node.template.Builder.Entities &&
                  node.template.Builder.Entities._string !== undefined;
        }, 
        function target(node){
          var ents = H.replace(node.template.Builder.Entities._string.toLowerCase(), "\n", " ");
          if (ents.search("{civ}") !== -1){
            if(!node.template.Identity.Civ){
              deb("ERROR : {civ} but no Indetity.Civ");
            } else {
              ents = H.replace(ents, "{civ}", node.template.Identity.Civ);
            }
          }
          return (
            ents.split(" ").filter(function(s){return !!s;})
              .map(function(t){return H.replace(t, "_", ".");})
              .map(function(t){return H.replace(t, "/", ".");})
          );
        }, false
      );


      // Entities train Entities (mind {civ})

      this.createEdges("train", "trainedby", "entities train entities",
        function test(node){
          return  !!node.template.ProductionQueue && 
                  !!node.template.ProductionQueue.Entities &&
                  node.template.ProductionQueue.Entities._string !== undefined;
        }, 
        function target(node){
          var ents = H.replace(node.template.ProductionQueue.Entities._string.toLowerCase(), "\n", " ");
          if (ents.search("{civ}") !== -1){
            if(!node.template.Identity.Civ){
              deb("ERROR : {civ} but no Indetity.Civ");
            } else {
              ents = H.replace(ents, "{civ}", node.template.Identity.Civ);
            }
          }
          return (
            ents.split(" ").filter(function(s){return !!s;})
              .map(function(t){return H.replace(t, "_", ".");})
              .map(function(t){return H.replace(t, "/", ".");})
            );
        }, false
      );


      // Buildings hold classes

      this.createEdges("hold", "holdby", "entities hold classes",
        function test(node){
          return  !!node.template.GarrisonHolder &&
                  node.template.GarrisonHolder.List._string;
        }, 
        function target(node){
          var list = node.template.GarrisonHolder.List._string.toLowerCase();
          list = H.replace(list, "\n", " ");
          list = H.replace(list, "+", " ");
          return list.split(" ").filter(function(s){return !!s;});
        }, false
      );


      // Healer heal classes

      this.createEdges("heal", "healedby", "healer heal classes",
        function test(node){
          return  !!node.template.Heal &&
                  node.template.Heal.HealableClasses._string !== undefined;
        }, 
        function target(node){
          return (
            H.replace(node.template.Heal.HealableClasses._string.toLowerCase(), "\n", " ")
              .split(" ").filter(function(s){return !!s;})
            );
        }, false
      );


      // Entities research technologies

      this.createEdges("research", "researchedby", "entities research technologies",
        function test(node){
          return  !!node.template.ProductionQueue && 
                  !!node.template.ProductionQueue.Technologies &&
                  node.template.ProductionQueue.Technologies._string;
        }, 
        function target(node){
          return (
            H.replace(node.template.ProductionQueue.Technologies ._string.toLowerCase(), "\n", " ")
              .split(" ").filter(function(s){return !!s;})
              .map(function(t){return H.replace(t, "_", ".");})
              .map(function(t){return H.replace(t, "/", ".");})
            );
        }, false
      );


      // Entities require/enable technologies

      this.createEdges("require", "enable", "entities require/enable technologies",
        // other.wallset.palisade -> phase.village
        function test(node){
          return  (
            !!node.template.Identity && 
            !!node.template.Identity.RequiredTechnology
          );
        }, 
        function target(node){
          var tech = node.template.Identity.RequiredTechnology;
          tech = H.replace(tech, "_", ".");
          tech = H.replace(tech, "/", ".");
          return [tech];
        }, false
      );


      // Entities accept resourcestype (Dropsite)

      this.createEdges("accept", "acceptedby", "entities accept resourcetypes (dropsites)",
        function test(node){
          return  (
            !!node.template.ResourceDropsite &&
            node.template.ResourceDropsite.Types !== undefined
          );
        }, 
        function target(node){
          return (
            H.replace(node.template.ResourceDropsite.Types.toLowerCase(), "\n", " ")
              .split(" ").filter(function(s){return !!s;})
            );
        }, false
      );


      // Entities carry resourcestype (Ships)

      this.createEdges("carry", "carriedby", "entities carry resourcetypes (ships, trader, gatherer)",
        // units.athen.cavalry.javelinist.e -> food
        function test(node){
          return  !!node.template.ResourceGatherer && 
                  node.template.ResourceGatherer.Capacities !== undefined;
        }, 
        function target(node){
            return H.attribs(node.template.ResourceGatherer.Capacities).sort();
        }, false
      );

    }    

  };

  // H.Culture = function(tree, debug){

  //   deb();deb();deb("  CULT: build culture/store for player id: %s, %s", tree.id, tree.civ);

  //   this.debug = debug || 0;

  //   this.civ  = tree.civ;
  //   this.tree = tree;
  //   this.tree.culture = this;

  //   this.verbs = H.Data.verbs;
  //   this.store = new H.LIB.Store(tree.civ);
  //   this.verbs.forEach(this.store.addVerb.bind(this.store)); //??

  //   // stores nodes found in templates
  //   this.classes = [];
  //   this.technologies = [];
  //   this.resources = [];
  //   this.resourcetypes = [];

  // };

return H; }(HANNIBAL));