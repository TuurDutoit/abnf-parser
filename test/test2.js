import * as ABNF from "../lib/all";

var fs = require("fs");
var abnfStr = fs.readFileSync("abnf.txt", {encoding: "utf-8"});

var src = new ABNF.parser.Source( abnfStr, "abnf.txt" );

//console.log(src);

var token = src.tokens[48];
throw token.error().expected("/");