/*jslint bitwise: true, browser: true, todo: true, evil:true, devel: true, debug: true, nomen: true, plusplus: true, sloppy: true, vars: true, white: true, indent: 2 */
/*globals HANNIBAL, deb, uneval */

/*--------------- C O N T E X T  ----------------------------------------------

  Hannibal's Bots can run in 3 different contexts: a) the game, b) a simulator and 
  c) the Explorer. Most importantly contexts differ in sensors and effectors,
  0AD saves and loads serialized contexts.

  tested with 0 A.D. Alpha 17 Quercus
  V: 0.1, agentx, CGN, NOV, 2014

*/

HANNIBAL = (function(H){

  H.LIB.Context = function(name){

    this.defaults = {                                    // all primitive data
      name:           name,
      connector:      "",
      time:           Date.now(),                        // time game created/saved 
      timeElapsed:    0,                                 // API data
      idgen:          1,                                 // seed for unique object ids
      turn:           0,                                 // increments on API tick
      tick:           0,                                 // increments on BOT tick
    };

    // stateful support objects, ordered
    this.serializers = [
      "events", 
      "culture",     // store, tree, phases
      "map",         // grids
      "resources",   // after map
      "villages", 
      "scanner",     // scanner after map, before groups
      "groups",      // assets
      // "economy",     // stats, producers, orderqueue
      // "military", 
      // "brain", 
    ];

    // sequence to init serializers
    this.actions = [
      "clone",
      "import",
      "deserialize",
      "initialize",
      "finalize",
      "activate",
      "log",
    ];

    // debug, avoid noisy logs during sequence
    this.logger = [
      // "events", 
      // "culture",     // store, tree, phases
      // "map",         // grids
      // "resources",   // after map
      // "villages", 
      // "scanner",     // scanner after map, before groups
      // "groups",      // assets
      // "economy",     // stats, producers, orderqueue
      // "military", 
      // "brain", 
    ];

    // set initial properties
    this.data = {};
    H.extend(this, this.defaults);
    this.serializers.forEach(s => this.data[s] = null);

  };

  H.LIB.Context.prototype = {
    constructor: H.LIB.Context,
    log: function(){
      var data = {};
      H.each(this.defaults, name => data[name] = this[name]);
      deb("   CTX: %s", uneval(data));
    },
    runSequence: function(fn){
      this.actions.forEach( action => {
        this.serializers.forEach( serializer => {
          fn(action, serializer);
        });      
      });      
    },
    createBot: function(){
      return (this.bot = new H.LIB.Bot(this).import().initialize());
    },
    deserialize: function(data){
      var name = this.name;
      H.extend(this, data);
      this.name = name;
    },
    serialize: function(){
      return {
        name:          this.name,
        connector:     this.connector,
        time:          Date.now(),
        timeElapsed:   this.timeElapsed,
        idgen:         this.idgen,
        id:            this.id,
        turn:          this.turn,
        tick:          this.tick,
        difficulty:    this.difficulty,
        data:          this.bot.serialize(),
      };

    },
    clone: function(){

      // creates a new context by de/serializing this one
      // does initialize

      var ctxClone = new H.LIB.Context(this.name + ".copy");

      // copy primitive data
      H.each(this, name => {
        if (!H.contains(this.serializers, name)){
          ctxClone[name] = this[name];
        }
      });

      // reset id generator
      ctxClone.idgen = 1;  /// ????

      // add connecter specific interfaces
      H.extend(ctxClone, {
        query:      function(hcq, debug){
          return new H.LIB.Query(ctxClone.culture.store, hcq, debug);
        },
        class2name: function(klass){
          return new H.LIB.Query(ctxClone.culture.store, klass + " CONTAIN").first().name;
        },
      });

      // create serializers
      this.runSequence( (action, serializer) => {

        var obj = ctxClone[serializer];

        if (action === "clone"){
          ctxClone[serializer] = this[serializer].clone(ctxClone);

        } else if (!(action === "log" && !H.contains(this.logger, serializer))){
          ( obj[action]  && obj[action]() );

        } else {
          deb("   IGN: logger: %s", serializer);
        }

      });

      return ctxClone;

    },
    initialize: function(){

      this.serializers.forEach(serializer => {
        this[serializer] = new H.LIB[H.noun(serializer)](this);
      });

      this.runSequence( (action, serializer) => {

        var obj = this[serializer];

        // deb("   CTX: %s initialize: a: %s.%s", this.name, serializer, action);

        if (action === "clone"){ // do nothing

        } else if (!(action === "log" && !H.contains(this.logger, serializer))){
          ( obj[action] && obj[action]() );

        } else {
          deb("   IGN: logger: %s", serializer);

        }

      });

      deb("   CTX: %s initialized", this.name);

    },
    connectEngine: function(launcher, gameState, sharedScript, settings){

      H.extend(this, {

        connector:           "engine",
        launcher:            launcher,
        config:              H.Config,                          // 

        id:                  settings.player,                   // bot id, used within 0 A.D.
        difficulty:          settings.difficulty,               // Sandbox 0, easy 1, or nightmare or ....

        phase:               gameState.currentPhase(),          // num
        cellsize:            gameState.cellSize, 
        width:               sharedScript.passabilityMap.width  *4, 
        height:              sharedScript.passabilityMap.height *4, 
        circular:            sharedScript.circularMap,
        territory:           sharedScript.territoryMap,
        passability:         sharedScript.passabilityMap,

        // API read/write
        metadata:            H.Proxies.MetaData(sharedScript._entityMetadata[settings.player]),

        // API read only, static
        templates:           settings.templates,
        techtemplates:       sharedScript._techTemplates, 

        // API read only, dynamic
        states:              H.Proxies.States(gameState.entities._entities),
        entities:            gameState.entities._entities,
        technologies:        sharedScript._techTemplates, 
        techmodifications:   sharedScript._techModifications,
        player:              sharedScript.playersData[settings.player],
        players:             sharedScript.playersData,

        effector:            new H.LIB.Effector({connector: "engine"}),

        query:               (hcq, debug) => {
          return new H.LIB.Query(this.culture.store, hcq, debug);
        },
        class2name:          klass => {
          return new H.LIB.Query(this.culture.store, klass + " CONTAIN").first().name;
        },

        operators:           H.HTN.Economy.operators,
        methods:             H.HTN.Economy.methods,
        planner:             new H.HTN.Planner(this, {
          name:      "eco.planner",
          verbose:   1
        }),

      });

    },


  };

return H; }(HANNIBAL));  
