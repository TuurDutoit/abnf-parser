function pad( str, len ) {
  return " ".repeat( len - str.toString().length ) + str;
}


class RasperError extends Error {
  
  constructor( message, path, line, char, name ) {
    super();

    this.origMessage = message;
    this.message = this.getDescription();
    this.name = name;
    this.path = path;
    this.line = line;
    this.char = char;
    
  }
  
  getDescription() {
    return this.origMessage +
           " at " + this.path + ":" + ( this.line + 1 ) + ":" + ( this.char + 1 );
  }
  
}


const SyntaxError = class RasperSyntaxError extends RasperError {
  
  constructor( message, src, line, char, name = "SyntaxError" ) {
    super( message, src.path, line, char, name );
    
    this.src = src;
    this.message = this.getLongDescription();
    
  }
  
  getLongDescription() {
    let min = Math.max( this.line - 3, 0 );
    let max = this.line + 1;
    let prefixLen = ( max + 1 ).toString().length;
    let lines = this.src.lines.slice( min, max );
    let indicator = " ".repeat( this.char ) + "^";
    let desc = this.getDescription();
    
    return desc + "\n\n" +
           lines.map( ( l, i ) => "  | " + pad( min + i + 1, prefixLen ) + " | " + l ).join( "\n" ) + "\n" +
           " ".repeat( prefixLen + 7 ) + indicator;
  }
  
};


const Token = class RasperToken {
  
  constructor( val, src, line, char ) {
    
    this.val = val.trim();
    this.len = this.val.length;
    this.src = src;
    this.line = line;
    this.char = char;
    
  }
  
  error( message, type ) {
    return new ABNFError( message, this.src.path, this.line, this.char, type );
  }
  
  syntaxError( message = "Unexpected token '" + this.val + "'" ) {
    return new SyntaxError( message, this.src, this.line, this.char );
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



const ANY_WHITESPACE = /^\s*/;









function nameFrom( token ) {
  return token.val[0] === "<" ? token.val.slice( 1, -1 ) : token.val;
}


/**
 * Utility Classes
 * =============================================================================
 */


const Source = class ABNFSource {
  
  constructor( src, path = "unknown" ) {
    
    this.path = path;
    this.src = src;
    this.lines = src.split( "\n" );
    this.tokensByRule = {};
    this.tokensPerLine = null;
    this.tokens = null;
    
    // Parse every line with lexer,
    // generating Token objects, which hold line/char info
    this.tokensPerLine = this.lines.map( ( line, i ) => {
      let char = line.match( ANY_WHITESPACE )[0].length;
      let tokensDirty = line.match( LEXER );
      
      if ( !tokensDirty ) {
        return [];
      }
      
      return tokensDirty.map( t => {
        
        let token = new Token( t, this, i, char );
        char += t.length;
        return token;
        
      } );
      
    } );
    
    // Concatenate all lines into one big array of tokens
    this.tokens = this.tokensPerLine.reduce( ( all, line ) => all.concat( line ), [] );
    
    // Sort tokens by rule,
    // taking care of =/ tokens
    // and removing comments
    let ruleTokens;
    for ( let i = 0, len = this.tokens.length - 1; i < len; i++ ) {
      let token = this.tokens[ i ];
      let next = this.tokens[ i + 1 ];
      
      if ( next.val === "=" ) {
        
        ruleTokens = [];
        this.tokensByRule[ nameFrom( token ) ] = ruleTokens;
        
      } else if ( next.val === "=/" ) {
        
        ruleTokens = this.tokensByRule[ nameFrom( token ) ];
        ruleTokens.push( new Token( "/", this, next.line, next.char ) );
        
      } else if ( token.val[0] !== "=" && token.val[0] !== ";" ) {
        ruleTokens.push( token );
      }
      
    }
    
    let lastToken = this.tokens[ this.tokens.length - 1 ];
    
    if ( lastToken.val[0] !== ";" ) {
      ruleTokens.push( lastToken );
    }
    
  }
  
};



/**
 * Node Classes
 * =============================================================================
 */

var fs = require("fs");
var abnfStr = fs.readFileSync("abnf.txt", {encoding: "utf-8"});

var src = new Source( abnfStr, "abnf.txt" );

console.log(src);

var token = src.tokensByRule.complex[3];
var err = token.syntaxError();
console.log(err.getLongDescription());
