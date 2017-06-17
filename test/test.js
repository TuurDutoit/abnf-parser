import * as ABNF from "../lib/parser";
var fs = require("fs");

var abnfStr = fs.readFileSync( "test/abnf.txt", { encoding: "utf-8" } );
var parser = new ABNF.Parser( abnfStr, "string" );
module.exports = parser;