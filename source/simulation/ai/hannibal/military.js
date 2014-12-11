/*jslint bitwise: true, browser: true, todo: true, evil:true, devel: true, debug: true, nomen: true, plusplus: true, sloppy: true, vars: true, white: true, indent: 2 */
/*globals HANNIBAL, deb, uneval */

/*--------------- M I L I T A R Y ---------------------------------------------

  knows about buildings and attack plans
  

  tested with 0 A.D. Alpha 17 Quercus
  V: 0.1, agentx, CGN, Nov, 2014

*/


HANNIBAL = (function(H){


  H.LIB.Military = function(context){

    H.extend(this, {

      name:    "military",
      context: context,
      imports: [
        "events",
      ],

    });

  };

  H.LIB.Military.prototype = {
    constructor: H.LIB.Military,
    log: function(){},
    clone: function(context){
      context.data[this.name] = this.serialize();
      return new H.LIB[H.noun(this.name)](context);
    },
    import: function(){
      this.imports.forEach(imp => this[imp] = this.context[imp]);
      return this;
    },
    deserialize: function(){
      if (this.context.data[this.name]){
        H.extend(this, this.context.data[this.name]);
      }
    },
    serialize: function(){
      return {};
    },
    initialize: function(){
      return this;
    },
    activate: function(){

      this.events.on("Attacked", "*", function (msg){

      });

    },
    tick: function(tick, secs){

      var t0 = Date.now();


      return Date.now() - t0;

    },
    getPhaseNecessities: function(options){ // phase, centre, tick
      
      var 
        cls = H.class2name,
        cc = options.centre,

        technologies = [],
        messages = {
          "phase.village": [
            [  20, {name: "BroadCast", data: {group: "g.builder", cc: cc, size: 5, building: cls("baracks"), quantity: 2}}],
          ],
          "phase.town" :   [

          ],
          "phase.city" :   [

          ],
        },
        launches = {

          "phase.village": [
          //   tck,                  act, params
            [  16, 1, "g.builder",    {cc: cc, size: 5, building: cls("barracks"), quantity: 1}],
          ],

          "phase.town" :   [
            [  20, 1, "g.builder",    {cc: cc, size: 5, building: cls("temple"), quantity: 1}],
            // [  20, [1, "g.tower",      {cc: cc, size: 5, quantity: 1}]],

          ],

          "phase.city" :   [

          ],

        };

      return {
        launches: launches,
        technologies: technologies,
        messages: messages,
      };

    },

  };

return H; }(HANNIBAL));  