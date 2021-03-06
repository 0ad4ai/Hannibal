/*jslint bitwise: true, browser: true, todo: true, evil:true, devel: true, debug: true, nomen: true, plusplus: true, sloppy: true, vars: true, white: true, indent: 2 */
/*globals Engine, HANNIBAL, H, deb */

/*--------------- D I S P L A Y -----------------------------------------------

  manages explorer interface



  tested with 0 A.D. Alpha 15 Osiris
  V: 0.1, agentx, CGN, Feb, 2014

*/

HANNIBAL = (function(H){

  var modes    = [
        "info", 
        "json", 
      ],
      examples = [
        "MEMBER",
        "siege HOLDBY",
        "structures.athen.market REQUIRE",
        "phase.town.athen RESEARCHEDBY",
        "structures.athen.civil.centre RESEARCH",
        "RESEARCH DISTINCT SORT < name",
        "RESEARCH DISTINCT SORT < name WITH costs.metal > 0",
        "RESEARCH DISTINCT SORT < name WITH requires.tech = 'phase.city'"
      ];

  
  H.QRY = function(hcq){return new H.HCQ(H.store, hcq);};    


  H.Display = {

    trim: function(ele){
      var str = ele.value.trim(), len = str.length, opt = 0;
      while (opt < len ){
        len = str.length;
        str = H.replace(str, "  ", " ");
        str = H.replace(str, " \n", "\n");
        str = H.replace(str, "\n ", "\n");
        opt = str.length;
      }
      ele.value = str;
    },

    findPosXY: function (obj) {
      var curleft = 0, curtop = 0;
      if (obj.offsetParent) {
        do {
          curleft += obj.offsetLeft;
          curtop  += obj.offsetTop;
        } while ((obj = obj.offsetParent));
        return [curleft, curtop];
      }
      return undefined;
    },

    activateTab: function(tabCtrl, pageId) {
      var lis = $$("#menu" + tabCtrl + " li");
      var li = 0;
      var obj = H[tabCtrl.slice(-4)] || null;
      var token = pageId.slice(-4).toLowerCase();
      tabCtrl = $(tabCtrl);
      pageId  = $(pageId);
      for (var i = 0; i < tabCtrl.childNodes.length; i++) {
        var node = tabCtrl.childNodes[i];
        if (node.nodeType == 1) { /* Element */
          node.style.display = (node == pageId) ? 'block' : 'none';
          if (lis[li]){lis[li].style.background = (node == pageId) ? '#456' : '#987';}
          li += 1;
          // console.log("activateTab", tabCtrl, pageId);
        }
      }
      if(obj && obj.tabActivate){
        obj.tabActivate(token);
      }
    },

    boxSelect: function(box, option){
      H.toArray(box.getElementsByTagName('option')).forEach(function(opt){
        // opt.selected = opt.value === option ? "selected" : "";
        opt.selected = decodeURIComponent(opt.innerHTML) === decodeURIComponent(option) ? "selected" : "";
      });
    },
    map: function(map){

      console.log("Display.map:", map, H.Maps.default);

      map = map || H.Maps.default;

      H.Maps.load(map, function(){
        H.Display.boxSelect($("slcMaps"), map);
      });

    },
    sim: function(sim){

      TIM.step("Display.sim:");

      H.Explorer.Simulator.init(sim);
      // H.Simulation.load({}, function(){
      //   // H.Display.boxSelect($("slcMaps"), map);
      // });

    },
    query: function(hqc){

      var t0    = Date.now(), s, 
          mode  = $("slcModes").value,
          qry   = new H.Store.Query(H.store, hqc),
          nodes = qry.execute(mode),
          t1    = Date.now(),
          html  = "", counter = 1, counter1 = 0,
          iconPath  = "/art/textures/ui/session/portraits/",
          tHeadInfo = "<thead><td class='hr'>#</td><td class='hr'>Icon</td><td>Name</td><td>Info</td><td /></thead>",
          tHeadJson = "<thead><td class='hr'>#</td><td class='hr'>Icon</td><td>Name</td><td>Property</td><td>Value</td><td /></thead>",
          tRowInfo  = "<tr><td class='hr'>%s</td><td><img class='icon' width='32' height='32' src='%s' /></td><td class='cl' onclick='H.Browser.do(\"*;*;*;analyze;%s\")'>%s</td><td>%s</td><td /></tr>",
          tRowName0 = "<tr><td class='hr bd'>%s</td><td><img class='icon' width='32' height='32' src='%s' /></td><td  class='cl bd' onclick='H.Browser.do(\"*;*;*;analyze;%s\")'>%s</td><td class='bd'>%s</td><td class='bd'>%s</td><td /></tr>",
          tRowName  = "<tr><td class='hr'></td><td></td><td></td><td>%s</td><td>%s</td><td /></tr>";

      $("tblResult").innerHTML = "";
      $("txtHCQ").value = hqc;
      H.Browser.error("");
      H.Browser.info("");

      switch (mode) {
        case "info" : html += tHeadInfo; break;
        case "json" : html += tHeadJson; break;
      }

      nodes.forEach(function(node){
        counter1 = 0;
        switch (mode) {
          case "info" :
            html += H.format(tRowInfo, counter, iconPath + node.icon, node.name, node.name, node.info);
          break;
          case "json" :
            H.each(node, function(prop, value){
              if (prop !== 'name' && prop !== "icon"){
                if (counter1 === 0){
                  html += H.format(tRowName0, counter, iconPath + node.icon, node.name, node.name, prop, value);
                } else {
                  html += H.format(tRowName, prop, H.prettify(value));
                }
                counter1 += 1;
              }
            });
          break;
        }
        counter += 1;
      });

      s = nodes.stats;
      H.Browser.info(H.format(
        "store: %s, nodes: %s, edges: %s, length: %s, %s ops, %s msecs, cached: %s, hits: %s", 
        H.Bot.civ, s.nodes, s.edges, s.length, s.ops, s.msecs, s.cached, s.hits
      ));

      $("tblResult").style.tableLayout = "auto";
      $("tblResult").innerHTML = html;

    },

    analyze: function (name){

      var t0 = Date.now(), i = 0, 
          node = H.store.nodes[name], nodes,
          mode = slcModes.value,
          cntVerbs = H.store.verbs.length,
          append = function(html){tblResult.innerHTML += html;},
          s = {length: 0, ops: 0, msecs: 0},
          tHeadInfo = "<thead><td>Node</td><td>Verb</td><td>Nodes</td><td>Info</td><td /></thead>",
          tHeadJson = "<thead><td>Node</td><td>Verb</td><td>Nodes</td><td>Property</td><td>Value</td><td /></thead>",
          tRow0Info = "<tr><td class='bd'>%s</td>%s<td></td><td></td><td /></tr>",
          tRow0Json = "<tr><td class='bd'>%s</td><td class='bd'>%s</td><td></td><td></td><td></td><td /></tr>",
          tRowXJson = "<tr><td class='hr'></td><td></td><td></td><td class='hr'>%s</td><td>%s</td><td /></tr>",
          tRowInfo  = "<tr><td></td><td></td><td class='cl' onclick='H.Browser.do(\"*;*;*;analyze;%s\")'>%s</td><td class='el' >%s</td><td /></tr>",
          tRowInfo1 = "<tr><td></td><td></td><td class='cl' onclick='H.Browser.do(\"*;*;*;analyze;%s\")'>%s</td><td></td><td></td><td /></tr>",
          // tRowInfoX = "<tr><td class='hr'></td><td></td><td class='bd' colspan='2'>%s</td><td></td><td /></tr>";
          tRowInfoX = "<tr><td class='hr'></td><td></td><td colspan='3' class='cl bd' onclick='H.Browser.do(\"*;*;*;analyze;%s\")'>%s</td><td /></tr>";
          tRowNJson = "<tr><td colspan='5' /></tr>",

      $("tblResult").innerHTML = "";
      $("tblResult").style.tableLayout = "auto";
      $("txtHCQ").value = name;
      H.Browser.error("");
      H.Browser.info("");

      switch (mode) {
        case "info" : append(tHeadInfo); break;
        case "json" : append(tHeadJson); break;
      }    

      H.store.verbs.forEach(function(verb){

        verb = verb.toUpperCase();

        var hcq = name + " " + verb,
            didHeader = false;

        nodes = H.QRY(hcq).forEach(function(node){
          if(!didHeader){
            switch (mode) {
              case "info" :        
                // append(H.format(tRow0Info, name, verb));
                append(H.format(tRow0Info, name, H.format("<td class='cl bd' onclick='H.Browser.do(\"*;*;*;query;%s %s\")'>%s</td>", name, verb, verb)));
              break;
              case "json":
                append(H.format(tRow0Json, name, verb));
              break;
            }
            didHeader = true;
          }
          switch (mode) {
            case "info" :        
              append(H.format(tRowInfo, node.name, node.name, node.info || "undefined"));
            break;
            case "json" :
              append(H.format(tRowInfoX, node.name, node.name));
              H.each(node, function(prop, value){
                if (prop !== 'name'){
                  append(H.format(tRowXJson, prop, H.prettify(value)));
                }
              });         
              append("<tr><td colspan='5' /></tr>") ;
            break;
          }
        });

        s.length += nodes.stats.length;
        s.ops += nodes.stats.ops;
        s.msecs += nodes.stats.msecs;

      });

      H.Browser.info(H.format(
        "store: %s, nodes: %s, edges: %s, queries: %s, length: %s, %s ops, %s msecs", 
        H.Bot.civ, nodes.stats.nodes, nodes.stats.edges, nodes.stats.verbs, s.length, s.ops, s.msecs
      ));

    },

    plan: function(what){

      console.log('plan', what);

      var state = "", goal = "", node, centre;

      $("cError").innerHTML = "";
      $("cInfo").innerHTML = "";

      state += '{';
      state += '"ress": {},';
      state += '"ents": {"structures.%s.civil.centre": 1},';          // Node
      state += '"tech": ["phase.village"]';
      state += '}';

      goal  += '{';
      goal  += '"ress": {},';
      goal  += '"ents": {"%s": 1},';           // CC
      goal  += '"tech": []';        
      goal  += '}';

      // $("txtHCQ").value = $("slcNodes").value;
      try {
        state = JSON.parse(H.format(state, H.Bot.civ));
      } catch(e){
        $("cError").innerHTML  = "Error: Check JSON of state<br />";
        $("cError").innerHTML += "<span class='f80'>[" + e + "]</span>";
        return;
      }

      try {
        // goal = JSON.parse(H.format(goal,  $("slcNodes").value));
        goal = JSON.parse(H.format(goal, what));
      } catch(e){
        $("cError").innerHTML  = "Error: Check JSON of goal<br />";
        $("cError").innerHTML += "<span class='f80'>[" + e + "]</span>";
        return;
      }
      H.HTN.Economy.runTarget(~~$('slcVerbose').value, state, goal);

    },  
    pritCosts: function (costs){
      var c = JSON.stringify(costs);
      c = H.replace(c, '"', "");
      c = H.replace(c, '{', "");
      c = H.replace(c, '}', "");
      c = H.replace(c, ',', "<br />");
      return c;
    },  
    pritObj: function (o, depth){

      depth = depth || 0;

      var html = "";

      H.each(o, function(k, v){

        var akku = [];

        if (k === 'ress') {
          H.each(v, function(k, v){
            akku.push(k + ": " + v);
          })
          html += "<tr><td>&nbsp;&nbsp;ress: { " + akku.join(", ") + " }</td></tr>";

        } else if (k === 'tech') {
          html += "<tr><td>&nbsp;&nbsp;" + k + ": [</td></tr>";
          html += pritObj(v, depth +2);
          html += "<tr><td>&nbsp;&nbsp;]</td></tr>";

        } else if (typeof v === 'object'){
          html += "<tr><td>&nbsp;&nbsp;" + k + ": {</td></tr>";
          html += pritObj(v, depth +2);
          html += "<tr><td>&nbsp;&nbsp;}</td></tr>";

        } else if (k === 'name') {
          // do nothing
        } else {
          html += "<tr><td>&nbsp;&nbsp;" + H.mulString("&nbsp;", depth) + k + ": " + v + "</td></tr>";
        }

      });

      return html + "<tr></tr>";

    },

    pritJSON: function (json, depth){

      var html = "",
          space = H.mulString("&nbsp;", depth || 0),
          tab  = function (s,l){return H.replace(H.tab(s,l), " ", "&nbsp;");};

      depth = depth || 0;

      H.each(json, function(k, v){

        var akku = [];

        if (Array.isArray(v)) {
          html += space + k + ": " + JSON.stringify(v) + ",<br />";

        } else if (typeof v === 'object' && depth === 0){
          html += space + "<b>" + k + "</b>" + ": {<br />";
          html += H.Display.pritJSON(v, depth +2);
          html += space + "},<br /><br />";

        } else if (typeof v === 'object'){
          html += space + k + ": {<br />";
          html += H.Display.pritJSON(v, depth +2);
          html += space + "},<br />";

        } else {
          html += space + k + ": " + JSON.stringify(v) + ",<br />";
        }

      });

      return html;

    },

    hide: function(){
      $("menVerbose").style.display = "none";
      // $("contASM").style.display = "none";
      // $("contHTN").style.display = "none";
      $$(".contHCQ").style.display = "none";
      $$(".contHTN0AD").style.display = "none";      
      $$(".contMMAP").style.display = "none";      
      $$(".contTECH").style.display = "none";    
    },

    clear: function(notifo){
      debug.innerHTML = "";
      tblResult.innerHTML = "";
      if (notifo) {$("ifoResult").innerHTML = "";}
    },

    init: function(){

      var HD = H.Display;

      // polluting global on purpose
      // contHTN0AD = document.querySelector(".contHTN0AD");
      // contASM    = document.querySelector(".contASM");
      // contHTN    = document.querySelector(".contHTN");
      // contHCQ    = document.querySelector(".contHCQ");
      // contMMAP   = document.querySelector(".contMMAP");
      // menASM     = gid("menASM");
      // menHQC     = gid("menHQC");
      // menHTN     = gid("menHTN");
      menHTN0AD  = gid("menHTN0AD");
      txtHQC     = gid("txtHQC");
      // slcCivs    = gid("slcCivs");
      slcVerbs   = gid("slcVerbs");
      slcNodes   = gid("slcNodes");
      slcModes   = gid("slcModes");
      txtHQC     = gid("txtHQC");
      btnGoHCQ   = gid("btnGoHCQ");
      btnClear   = gid("btnClear");
      btnAnalyze = gid("btnAnalyze");
      btnHTN0ADGO= gid("btnHTN0ADGO");
      tblResult  = gid("tblResult");
      ifoResult  = gid("ifoResult");
      debug      = gid("debug");

      
      this.populateSelectBox(slcVerbs, H.store.verbs.map(String.toUpperCase));
      this.populateSelectBox(slcNodes, H.attribs(H.store.nodes));
      this.populateSelectBox(slcExams, examples);
      // this.populateSelectBox(slcModes, modes);

      // gid("menMMAP").onclick = function(){
      //   HD.hide();HD.clear();
      //   tblResult.style.tableLayout = "fixed";
      //   contMMAP.style.display = "block";
      // }

      gid("menTECH").onclick = function(notifo){
        HD.hide();HD.clear(notifo);
        tblResult.style.tableLayout = "fixed";
        $$(".contTECH").style.display = "block";
        $("jsonTECH").innerHTML = pritJSON(techTemplates);
      }

      // $("menASM").onclick = function(){
      //   HD.hide();HD.clear();
      //   tblResult.style.tableLayout = "fixed";
      //   contASM.style.display = "block";
      // }

      menHQC.onclick = function(notifo){
        HD.hide();HD.clear(notifo);
        tblResult.style.tableLayout = "auto";
        $$(".contHCQ").style.display = "block";
      }

      // menHTN.onclick = function(){
      //   HD.hide();HD.clear();
      //   tblResult.style.tableLayout = "fixed";
      //   contHTN.style.display = "block";
      // }

      menHTN0AD.onclick = function(notifo){
        HD.hide();HD.clear(notifo);
        $("menVerbose").style.display = "block";
        tblResult.style.tableLayout = "fixed";
        $$(".contHTN0AD").style.display = "block";
      }

      $("slcCivs").onchange = $("slcCivs").onselect = function(){
        H.Bot.civ = $("slcCivs").value;
        HD.clear();
        H.Display.import(H.Bot.civ);
        slcNodes.innerHTML = "";
        H.Display.populateSelectBox(slcNodes, H.attribs(H.store.nodes));
      }

      slcExams.onchange = slcExams.onselect = function(){
        txtHQC.value = slcExams.value;
      }

      slcVerbs.onchange = slcVerbs.onselect = function(){
        txtHQC.value += " " + slcVerbs.value;
      }

      slcNodes.onchange = slcNodes.onselect = function(){
        txtHQC.value += " " + slcNodes.value;
      }

      btnClear.onclick = function(){
        txtHQC.value = "";
      };

      gid("btnHTN0ADT1").onclick = function(){
        H.HTN.Hannibal.Example1(~~(gid("slcVerbose").value));
      };
      gid("btnHTN0ADT2").onclick = function(){
        H.HTN.Hannibal.Example2(~~(gid("slcVerbose").value));
      };
      gid("btnHTN0ADT3").onclick = function(){
        H.HTN.Hannibal.Example3(~~(gid("slcVerbose").value));
      };

      btnHTN0ADSTRESS.onclick = function(){

        var state, goal, verbose, loops,
            debug = document.getElementById("debug");

        try {
          state = JSON.parse("{" + gid("txtState").value.trim() + "}");
        } catch(e){
          debug.innerHTML = "Error: Check JSON of state<br />";
          debug.innerHTML += "<span class='f80'>[" + e + "]</span>";
          return;
        }

        try {
          goal = JSON.parse("{" + gid("txtGoal").value.trim() + "}");
        } catch(e){
          debug.innerHTML = "Error: Check JSON of goal<br />";
          debug.innerHTML += "<span class='f80'>[" + e + "]</span>";
          return;
        }

        verbose = ~~(gid("slcVerbose").value)
        loops   = ~~(gid("slcStress").value.split(".").join(""))

        H.HTN.Hannibal.runStress(state, goal, loops);

      };


      btnPlan.onclick = function(){

        var state = "", goal = "", node, centre;

        $("debug").innerHTML = "";

        state += '{';
        state += '"ress": {},';
        state += '"ents": {"structures.%s.civil.centre": 1},';          // Node
        state += '"tech": ["phase.village"]';
        state += '}';

        goal  += '{';
        goal  += '"ress": {},';
        goal  += '"ents": {"%s": 1},';           // CC
        goal  += '"tech": []';        
        goal  += '}';

        $("txtHQC").value = $("slcNodes").value;
        try {
          state = JSON.parse(H.format(state, H.Bot.civ));
        } catch(e){
          $("debug").innerHTML  = "Error: Check JSON of state<br />";
          $("debug").innerHTML += "<span class='f80'>[" + e + "]</span>";
          return;
        }

        try {
          goal = JSON.parse(H.format(goal,  $("slcNodes").value));
        } catch(e){
          $("debug").innerHTML  = "Error: Check JSON of goal<br />";
          $("debug").innerHTML += "<span class='f80'>[" + e + "]</span>";
          return;
        }

        H.HTN.Hannibal.runExample(state, goal, ~~(gid("slcVerbose").value), $("slcNodes").value);

      };

      btnHTN0ADTC.onclick = function(){
        H.HTN.Hannibal.runCiv(H.Bot.civ);
      };
      btnHTN0ADGO.onclick = function(){

        var state, goal;

        $("debug").innerHTML = "";

        try {
          state = JSON.parse("{" + gid("txtState").value.trim() + "}");
        } catch(e){
          $("debug").innerHTML = "Error: Check JSON of state<br />";
          $("debug").innerHTML += "<span class='f80'>[" + e + "]</span>";
          return;
        }

        try {
          goal = JSON.parse("{" + gid("txtGoal").value.trim() + "}");
        } catch(e){
          $("debug").innerHTML = "Error: Check JSON of goal<br />";
          $("debug").innerHTML += "<span class='f80'>[" + e + "]</span>";
          return;
        }

        H.HTN.Hannibal.runExample(state, goal, ~~(gid("slcVerbose").value));

      };
      btnAnalyze.onclick = function(){
        H.analyze(slcNodes.value.trim());
      };
      
      btnGoHCQ.onclick    = function(){

        var t0    = Date.now(), s, 
            hqc   = txtHQC.value,
            mode  = slcModes.value,
            qry   = new H.Store.Query(H.store, hqc),
            nodes = qry.execute(mode),
            t1    = Date.now(),
            html  = "",
            counter = 1, counter1 = 0;

        tblResult.innerHTML = "";
        $("debug").innerHTML = "";

        switch (mode) {
          case "info" : 
            html += "<thead><td class='hr'>#</td><td>Name</td><td>Info</td></thead>";
          break;
          case "json" : 
            html += "<thead><td class='hr'>#</td><td>Name</td><td>Property</td><td>Value</td></thead>";
          break;
        }

        txtHQC.value = qry.query;
        nodes.forEach(function(node){
          counter1 = 0;
          switch (mode) {
            case "info" :
              html += H.format("<tr><td class='hr'>%s</td><td class='cl' onclick='H.analyze(\"%s\")'>%s</td><td>%s</td></tr>", counter, node.name, node.name, node.info);
            break;
            case "json" :
              H.each(node, function(prop, value){
                if (prop !== 'name'){
                  if (counter1 === 0){
                    html += H.format("<tr><td class='hr bd'>%s</td><td  class='cl bd' onclick='H.analyze(\"%s\")'>%s</td><td class='bd'>%s</td><td class='bd'>%s</td></tr>", counter, node.name, node.name, prop, value);
                  } else {
                    html += H.format("<tr><td class='hr'></td><td></td><td>%s</td><td>%s</td></tr>", prop, H.prettify(value));
                  }
                  counter1 += 1;
                }
              });
            break;
          }
          counter += 1;
        });

        s = nodes.stats;
        ifoResult.innerHTML = H.format(
          "store: %s, nodes: %s, edges: %s, length: %s, %s ops, %s msecs, cached: %s, hits: %s", 
          H.Bot.civ, s.nodes, s.edges, s.length, s.ops, s.msecs, s.cached, s.hits
        );

        tblResult.innerHTML = html;

      };


    },
    populateSelectBox: function(box, data){

      data.forEach(function(option){
        var opt = document.createElement('option');
        opt.innerHTML = option;
        opt.value = option;
        box.appendChild(opt);
      });

    },
    evaluateXPath: function (aNode, aExpr) {
      var xpe = new XPathEvaluator();
      var nsResolver = xpe.createNSResolver(aNode.ownerDocument == null ?
        aNode.documentElement : aNode.ownerDocument.documentElement);
      var result = xpe.evaluate(aExpr, aNode, nsResolver, 0, null);
      var found = [];
      var res;
      while ((res = result.iterateNext()))
        found.push(res);
      return found;
    }
  };




return H; }(HANNIBAL));   

