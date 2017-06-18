function pad( str, len ) {
  return " ".repeat( len - str.toString().length ) + str;
}

class RasperError extends Error {
  
  constructor( message, name ) {
    super();
    
    this.origMessage = message;
    this.name = name;
    
  }
  
  get message() {
    return this.getDescription();
  }
  
  getDescription() {
    return this.origMessage;
  }
  
}


const SyntaxError = class RasperSyntaxError extends RasperError {
  
  constructor( message, src, line, char, name = "SyntaxError" ) {
    super( message, name );
    
    this.src = src;
    this.line = line;
    this.char = char;

  }
  
  static forToken( token, message, ...rest ) {
    return new this( message, token.src, token.line, token.char, ...rest );
  }
  
  expected( token ) {
    
    this.origMessage += `, expected '${ token.val || token }'`;
    
    return this;
  }
  
  getShortDescription() {
    return this.origMessage +
           " at " + this.src.path + ":" + ( this.line + 1 ) + ":" + ( this.char + 1 );
  }
  
  getDescription() {
    let min = Math.max( this.line - 3, 0 );
    let max = this.line + 1;
    let prefixLen = ( max + 1 ).toString().length;
    let lines = this.src.lines.slice( min, max );
    let indicator = " ".repeat( this.char ) + "^";
    let desc = this.getShortDescription();
    
    return desc + "\n\n" +
           lines.map( ( l, i ) => "  | " + pad( min + i + 1, prefixLen ) + " | " + l ).join( "\n" ) + "\n" +
           " ".repeat( prefixLen + 7 ) + indicator;
  }
  
};

const ANY_WHITESPACE = /^\s*/;


const Token = class RasperToken {
  
  constructor( val, src, line, char ) {
    
    this.val = val.trim();
    this.len = this.val.length;
    this.src = src;
    this.line = line;
    this.char = char;
    
  }
  
  error( message = `Unexpected token '${this.val}'`, name ) {
    return SyntaxError.forToken( this, message, name );
  }
  
  toString() {
    return this.val;
  }
  
  toJSON() {
    return this.val;
  }
  
  inspect() {
    return this.val;
  }
  
};


const SimpleSource = class RasperSimpleSource {
  
  constructor( src, path = "unknown" ) {
    
    this.src = src;
    this.path = path;
    this.pointer = 0;
    this.stack = [];
    
  }
  
  _get( index ) {
    return this.tokens[ index ];
  }
  
  get( index = 0 ) {
    return this._get( this.pointer + index );
  }
  
  next() {
    let token = this.get();
    this.pointer++;
    return token;
  }
  
  forward( num ) {
    this.pointer += num;
    return this;
  }
  
  backward( num ) {
    this.pointer -= num;
    return this;
  }
  
  push( index = this.pointer ) {
    this.stack.push( index );
    return this;
  }
  
  pop() {
    return this.stack.pop();
  }
  
  atEnd() {
    return this.pointer = this.tokens.length - 1;
  }
  
};


const Source = class RasperSource extends SimpleSource {
  
  parse( lexer, filter ) {
    
    this.lines = this.src.split( "\n" );
    
    // Parse every line with lexer,
    // generating Token objects, which hold line/char info
    this.tokensPerLine = this.lines.map( ( line, i ) => {
      let char = line.match( ANY_WHITESPACE )[0].length;
      let tokensDirty = line.match( lexer );
      
      if ( !tokensDirty ) {
        return [];
      }
      
      return tokensDirty.map( t => {
        
        let token = new Token( t, this, i, char );
        char += t.length;
        return token;
        
      } );
      
    } );
    
    // Concatenate all lines into one big array of tokens and remove comments
    this.allTokens = this.tokensPerLine.reduce( ( all, line ) => all.concat( line ), [] );
    this.tokens = this.allTokens.filter( filter );
    
  }
  
};

/**
 * Deviations From RFC 5234
 *
 * To make the parsing of case-sensitive languages easier,
 * I added some features / core rules that could help make your ABNF grammar more readable.
 *
 * Note, though, that standards-compliant ABNF will be parsed correctly.
 * I only ADDED a few little things.
 *
 * - Some core rules were added.
 *   These are grouped under the 'Non-standard core rules' comment.
 * - An case-sensitive alternative for the standard double-quoted literals is provided.
 *   These use single quotes, i.e. "hello" is case INsensitive (as per the standard),
 *   but 'hello' is case SENSITIVE.
 * - Simpler syntax for delimited lists is provided.
 *   For example, parsing 'value1,value2,value3' (given VALUE and COMMA rules) in:
 *     * Standard ABNF: list = VALUE *(COMMA VALUE)
 *     * Here:          list = *{VALUE | COMMA}
 */


/**
 * Useful Variables
 * =============================================================================
 */


/*

Explanation of the lexer
========================

(?:                        // Content...
  ;.*$|                      // Comment
  =\/|                       // =/
  [=\/(){}[\]]|              // Special characters
  \d*\*\d*|\d|               // Repetition: 3*5, 3*, *5, * OR 5
  <?[a-z](?:[a-z0-9\-])*>?|  // Rule name: rule, rule1, my-rule, <rule>
  %[dbx](?:[0-9a-f\-.])+|    // Literal:  %b0100000, %x20-7E, %d72.101.108.108.111
                             // String: 'hello', "goodbye's", 'I\'m great'
  ('|")(?:(\\\\)*\\\1|(?!\1)('|")|[! #$%&\x28-\x7E])*\1
)
(?:\s|\n)*                 // ...followed by whitespace (we need this to calculate character offsets)

*/

const LEXER = /(?:;.*$|=\/|[=\/(){}[\]]|\d*\*\d*|\d|<?[a-z](?:[a-z0-9\-])*>?|%[dbx](?:[0-9a-f\-.])+|('|")(?:(\\\\)*\\\1|(?!\1)('|")|[! #$%&\x28-\x7E])*\1)(?:\s|\n)*/gmi;












/**
 * Utility Classes
 * =============================================================================
 */


const Source$1 = class ABNFSource extends Source {
  
  constructor( src, path ) {
    super( src, path );
    
    this.parse( LEXER, token => token.val[0] !== ";" );
    
    if ( this.tokens.length < 3 ) {
      throw new SyntaxError( "Expected at least 3 tokens in source string, found " + this.tokens.length, this, 0, 0 );
    }
    
  }
  
};

var fs = require("fs");
var abnfStr = fs.readFileSync("abnf.txt", {encoding: "utf-8"});

var src = new Source$1( abnfStr, "abnf.txt" );

//console.log(src);

var token = src.tokens[48];
throw token.error().expected("/");
