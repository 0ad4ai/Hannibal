

// Helper object for Hannibal's RMG

"use strict";

var H = {

  fmt:     function (){var a=H.toArray(arguments),s=a[0].split("%s"),p=a.slice(1).concat([""]),c=0;return s.map(function(t){return t + p[c++];}).join("");},
  toArray: function (a){return Array.prototype.slice.call(a);},
  deb:     function (){var s = H.fmt.apply(null, arguments); print("RMG   : " + s + "\n");},
};