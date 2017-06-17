import * as ABNF from "../lib/all";

var fs = require("fs");
var abnfStr = fs.readFileSync("abnf.txt", {encoding: "utf-8"});

var src = new ABNF.Source( abnfStr, "abnf.txt" );

console.log(src);

var token = src.tokensByRule.complex[3];
var err = token.syntaxError();
console.log(err.getLongDescription());