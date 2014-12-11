/*jslint bitwise: true, browser: true, todo: true, evil:true, devel: true, debug: true, nomen: true, plusplus: true, sloppy: true, vars: true, white: true, indent: 2 */
/*globals HANNIBAL */

/*--------------- C O N F I G --------------------------------------------

  The settings for all difficulties, attempting to leave nothing in the code,
  including access functions to select values for given difficulty.


  V: 0.1, agentx, CGN, Feb, 2014

*/


HANNIBAL = (function(H){

  H.Config = {

    //logging 0=zero, 1=errors, 2=1+warnings, 3=2+info, 4=everything
    deb:      4,                   // enables messages to dbgView via _xdebug.js.deb()
    con:      1,                   // enables messages to the in game console via _xdebug.js.con()

    // "" disables H.Tester
    sequence:                "brain02",
    // sequence: "Forest Battle",

    // enable psy-ops
    brag:                    true,  

    angle:                   3 * Math.PI/4,       // depends on first CC

    attackRelax:             2,     

    data:                    {
      sharedBuildingClasses: [
                            "civilcentre", 
                            "blacksmith", 
                            "farmstead",
                            "storehouse",
                            "barracks", // temporarely
                             ],
      prey:                  ["chicken", "sheep", "pig", "goat"], // possible food resources
    },

    numerus: {
      enabled:              true,
      file:                 "/home/noiv/Desktop/0ad/stats.csv",
      resolution:           10       // 10 = 16 secs
    },

    stats: {
      lengthStatsBuffer:    40, // approx 1 minute
    },

    economy: {
      intervalMonitorGoals: 10,
      maxAllocations:        5, // queue length for producers
    },

    civs : {
      athen:  {
        builders: 2,
      },
      brit:  {
        builders: 2,
      },
      cart:  {
        builders: 2,
      },
      celt:  {
        builders: 2,
      },
      gaul:  {
        builders: 2,
      },
      hele:  {
        builders: 2,
      },
      iber:  {
        builders: 2,
      },
      mace:  {
        builders: 2,
      },
      maur:  {
        builders: 4,
      },
      pers:  {
        builders: 2,
      },
      ptol:  {
        builders: 2,
      },
      rome:  {
        builders: 2,
      },
      sele:  {
        builders: 2,
      },
      spart:  {
        builders: 2,
      },
      theb:  {
        builders: 2,
      },
    },

    //TODO: run preflight check, whether all these frames are actually available
    behaviours: {
      "ai:ai":              {
        entry:              "whiteflag",
        whiteflag:          ["village"],
        village:            ["populate", "town", "victory"],
        town:               ["expand", "defense", "city", "victory"],
        city:               ["attack", "defense", "attack", "victory"],
        victory:            [],
      },
      "ai:ai:1":            {
        village:            ["populate", "technology", "town", "victory"],
      },
      "ai:mayor:main":      {
        entry:              "build",
        groups:             {
          grainpicker:      {min: 1, max:  3, amount: 1},
          // hunter:       {priority: 1, max: 20, amount: 1},
          // lumberjack:       {priority: 1, max: 20, amount: 1},
          // stoner:           {priority: 2, max: 20, amount: 1},
          // miner:            {priority: 3, max: 20, amount: 1},
        },
        build:              ["food", "wood", "houses", "expand"],
        expand:             ["food", "wood", "houses", "technology", "defense"],
      },
      "mayor:grainpicker" : {
        entry:              "gather",
        gather:             ["find", "sustain"]  // garrison, heal, no reaeson to dissolve
      }
    },

    getBehaviour: function (name, difficulty){

      var basic, upgrade, i = difficulty;

      // deb("getBehaviour: %s, %s", name, difficulty);

      // pick most simple
      basic = H.Config.behaviours[name];
      basic.name = H.format("%s:%s", name, 0);

      // upgrade matching difficulty, downgrade if needed
      while(i--){
        upgrade = H.Config.behaviours[H.format("%s:%s", name, i)];
        if (upgrade){
          H.extend(basic, upgrade);
          basic.name = H.format("%s:%s", name, i);
          break;
        }
      }

      // logObject(basic, H.format("getBehaviour: %s (%s)", name, difficulty));

      return basic;

    },
    get: function (difficulty){

      var C = H.Config;

      C.difficulty = difficulty;

      switch (difficulty){

        // 0 is sandbox, 1 is easy, 2 is medium, 3 is hard, 4 is very hard.
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:



        break;

        default:
          // debugE("Config: unknown difficilty! %s", difficulty);
          return {};

      }

      return C;

    }

  };

return H; }(HANNIBAL));