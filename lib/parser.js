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


import { Range, SyntaxError, Token } from "./core";
export { Parser, Rule, OrRule, AndRule, OptionalRule, RepetitionRule,
         CaseSensitiveStringRule, CaseInsensitiveStringRule,
         Source, parseGroup, parseSubRule, parseRepetition, parseLiteral };


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

export const LEXER = /(?:;.*$|=\/|[=\/(){}[\]]|\d*\*\d*|\d|<?[a-z](?:[a-z0-9\-])*>?|%[dbx](?:[0-9a-f\-.])+|('|")(?:(\\\\)*\\\1|(?!\1)('|")|[! #$%&\x28-\x7E])*\1)(?:\s|\n)*/gmi;
export const RULE = /^\s*<?([a-z]([a-z0-9\-])*)>?\s*=/i;
export const REPETITION = /^\d|(\d*\*\d*)$/;
export const WHITESPACE = /^\s+$/;
export const ANY_WHITESPACE = /^\s*/;
export const NEWLINE = /\n/g;
export const EOF = undefined;

export const BASES = {
  "b": 2,
  "d": 10,
  "x": 16
};


export const coreRules = ({
  alpha: "%x41-5A / %x61-7A", // a-z A-Z
  bit: "'1' / '0'",           // A 1 or 0
  char: "%x01-7F",            // Any 7-bit US ASCII character, excluding NUL
  cr: "%x0D",                 // Carriage return
  crlf: "CR LF",              // Internet standard newline
  ctl: "%x00-1F / %x7F",      // Controls
  digit: "%x30-39",           // 0-9
  dquote: "%x22",             // Double quote
  hexdig: 'DIGIT / "A" / "B" / "C" / "D" / "E" / "F"', // Hexadecimal digit (0-F, case-insensitive)
  htab: "%x09",               // Horizontal tab
  lf: "%x0A",                 // Line feed
  lwsp: "*(WSP / CRLF WSP)",  // Linear whitespace. Allows blank lines, so be cautious!
  octet: "%x00-FF",           // 8 bits of data
  sp: "%x20",                 // A space character
  vchar: "%x21-7E",           // Visible / printable characters
  wsp: "SP / HTAB",           // Whitespace
  
  // Non-standard core rules:
  ihexdig: "DIGIT / 'A' / 'B' / 'C' / 'D' / 'E' / 'F'", // Case-sensitive hexadecimal digit (0-F)
  squote: ""
});


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
  
}



/**
 * Parsers
 * =============================================================================
 */


function parseGroup( ctx, endToken ) {
  let parts = [], part = [];
  let currentRule, token;
  
  while ( token = ctx.tokens[ 0 ] ) {
    
    if ( token === "/" ) {
      
      ctx.tokens.shift();
      parts.push( part );
      part = [];
      
    } else if ( token === endToken ) {
      
      ctx.tokens.shift();
      break;
      
    } else {
      
      part.push( parseSubRule( ctx ) );
      
    }
    
  }
  
  parts.push( part );
  parts = parts.map( part => part.length === 1 ? part[ 0 ] : new AndRule( part ) );
  
  return parts.length === 1 ? parts[ 0 ] : new OrRule( parts );
}


function parseSubRule( ctx ) {
  let token = ctx.tokens.shift();
  
  if ( token === "(" ) {
    
    return parseGroup( ctx, ")" );
    
  } else if ( token === "[" ) {
    
    return new OptionalRule( parseGroup( ctx, "]" ) );
    
  } else if ( token.charAt( 0 ) === '"' ) {
    
    return new CaseInsensitiveStringRule( token.slice( 1, -1 ) );
    
  } else if ( token.charAt( 0 ) === "'" ) {
    
    return new CaseSensitiveStringRule( token.slice( 1, -1 ) );
    
  } else if ( token.charAt( 0 ) === "%" ) {
    
    return parseLiteral( token );
    
  } else if ( REPETITION.test( token ) ) {
    let repetitions = parseRepetition( token );
    
    return new RepetitionRule( repetitions.min, repetitions.max, parseSubRule( ctx ) );
    
  } else {
    
    let subrule = ctx.rules[ token.toLowerCase() ];
    
    if ( !subrule ) {
      throw new ABNFSyntaxError( "Undefined rule: '" + token + "'" );
    }
    
    return subrule;
    
  }
  
}


function parseRepetition( rep ) {
  
  return {
    min: rep.charAt( 0 ) === "*" ? 0 : +( rep.slice( 0, rep.indexOf( "*" ) ) ),
    max: rep.charAt( rep.length - 1 ) === "*" ? Infinity : +( rep.slice( rep.indexOf( "*" ) + 1 ) )
  };
  
}


function parseLiteral( str ) {
  let res;
  
  if ( str.indexOf( "-" ) ) {
    
    let base = BASES[ str.slice( 1, 2 ) ];
    let [ min, max ] = str.slice( 2 ).split( "-" ).map( val => parseInt( val, base ) );
    let range = new Range( min, max );
    
    res = range.map( code => String.fromCharCode( code ) ).join( "" );
    
  } else {
    
    let base = BASES[ str.slice( 1, 2 ) ];
    let codes = str.slice( 2 ).split( "." ).map( val => parseInt( val, base ) );
    
    res = codes.map( code => String.fromCharCode( code ) ).join( "" );

  }
  
  return new CaseSensitiveStringRule( res );
}



/**
 * Node Classes
 * =============================================================================
 */


const Parser = class ABNFParser {
  
  constructor( src, entry ) {
    
    this.type = "parser";
    this.src = new Source( src );
    this.rules = {};
    this.allRules = [];
    this.entry = entry || this.src.tokens[0][0];
    
    // First, register all the rules
    this.src.tokens.forEach( ( tokens, i ) => {
      let name = tokens[0];
      let rule = new Rule( name, tokens, this.src.lines[ i ], i );
      
      this.rules[ name ] = rule;
      this.allRules.push( rule );
      
    } );
    
    // Then parse ABNF
    this.allRules.forEach( rule => rule.prepare( this.rules ) );
    
  }
  
  test( code ) {
    return this.rules[ this.entry ].test( code, 0 );
  }
  
  parse( code, generators ) {
    
    return this.rules[ this.entry ].parse( code, generators );
    
  }
  
}


const Rule = class ABNFRule {
  
  constructor( name, tokens, srcLine, index ) {
    
    this.type = "named";
    this.name = name.toLowerCase();
    this.originalName = name;
    this.allTokens = tokens;
    this.tokens = tokens.slice( 2 );
    this.src = srcLine;
    this.index = index;
    
  }
  
  prepare( rules ) {
    
    this.rule = parseGroup( { tokens: Array.from( this.tokens ), rules }, EOF );
    
  }
  
  test( token, index ) {
    return this.rule.test( token, index );
  }
  
  parse( code, generators ) {
    let node = null;
    
    if ( generators[ "before " + this.name ] ) {
      node = generators[ "before " + this.name ]( this );
    }
    
    let child = this.rule.parse( code, generators, node );
    
    return generators[ this.name ]( child, node );
  }
  
}


const OrRule = class ABNFOrRule {
  
  constructor( rules ) {
    
    this.type = "or";
    this.rules = rules;
    
  }
  
  test( code, index ) {
    
    for ( var i = 0, len = this.rules.length; i < len; i++ ) {
      
      let childLen = this.rules[ i ].test( code, index );
      
      if ( childLen !== false ) {
        return childLen;
      }
      
    }
    
    return false;
  }
  
}


const AndRule = class ABNFAndRule {
  
  constructor( rules ) {
    
    this.type = "and";
    this.rules = rules;
    
  }
  
  test( code, index ) {
    let len = 0;
    
    for ( var i = 0, num = this.rules.length; i < num; i++ ) {
      
      let childLen = this.rules[ i ].test( code, index + len );
      
      if ( childLen === false ) {
        return false;
      }
      
      len += childLen;
      
    }
    
    return len;
  }
  
}


const OptionalRule = class ABNFOptionalRule {
  
  constructor( rule ) {
    
    this.type = "optional";
    this.rule = rule;
    
  }
  
  test( code, index ) {
    return this.rule.test( code, index ) || 0;
  }
  
}


const RepetitionRule = class ABNFRepetitionRule {
  
  constructor( min, max, rule ) {
    
    this.type = "repetition";
    this.min = min;
    this.max = max;
    this.rule = rule;
    
  }
  
  test( code, index ) {
    let len = 0;
    
    for ( i = 0; i < this.max; i++ ) {
      
      let childLen = this.rule.test( code, index + len );
      
      if ( childLen === false ) {
        return i >= this.min && i <= this.max && len
      }
      
      len += childLen;
      
    }
    
    return len;
  }
  
}


const CaseSensitiveStringRule = class ABNFCaseSensitiveStringRule {
  
  constructor( str ) {
    
    this.type = "case-sensitive-string";
    this.str = str;
    
  }
  
  test( code, index ) {
    
    return code[ index ] === this.str && 1;
    
  }
  
}


const CaseInsensitiveStringRule = class ABNFCaseInsensitiveStringRule {
  
  constructor( str ) {
    
    this.type = "case-insensitive-string";
    this.str = str;
    
  }
  
  test( code, index ) {
    return code[ index ].toLowerCase() === this.str && 1;
  }
  
}