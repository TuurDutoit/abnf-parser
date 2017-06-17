/**
 * Useful Variables
 * =============================================================================
 */
 

// Comment OR =/ OR special characters OR repetition OR rule name / literal (e.g. %d60.61.62) OR string
const LEXER = /;.*$|=\/|[=\/()[\]]|\d*\*\d*|[a-z%](?:\w|-|\.)*|('|")(?:[ !\x23-\x7E])*\1/gmi;
const RULE = /^\s*[a-z](\w|-)*\s*=/i;
const REPETITION = /^\d|(\d*\*\d*)$/;
const EOF = undefined;

const BASES = {
  "b": 2,
  "d": 10,
  "x": 16
};





/**
 * Utility Classes
 * =============================================================================
 */


class Range extends Array {
  
  constructor( min, max, increment = 1 ) {
    let len = ( max - min ) / increment + 1;
    
    super( len );
    
    for ( let i = 0; i < len; i++ ) {
      this[ i ] = min + i * increment;
    }
    
  }
  
}


class ABNFSyntaxError extends Error {
  
  constructor( message ) {
    super( message );
  }
  
}


class Source {
  
  constructor( src ) {
    
    this.src = src;
    this._lines = src.split( "\n" );
    this.lines = [];
    
    // Rules can be wrapped over multiple lines
    this._lines.forEach( line => {
      
      if ( !RULE.test( line ) ) {
        
        if ( this.lines.length ) {
          this.lines[ this.lines.length - 1 ] += "\n" + line;
        }
        
      } else {
        
        this.lines.push( line );
        
      }
      
    } );
    
    // Lex source and remove comments and empty lines
    this.tokens = this.lines.map( rule => rule.trim().match( LEXER )
                                  .filter( token => token.charAt( 0 ) !== ";" ) )
                            .filter( line => line.length );
    
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
    
    let subrule = ctx.rules[ token ];
    
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


class Parser {
  
  constructor( src, entry ) {
    // TODO: multi-line rules
    
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
  
}


class Rule {
  
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
  
}


class OrRule {
  
  constructor( rules ) {
    
    this.type = "or";
    this.rules = rules;
    
  }
  
}


class AndRule {
  
  constructor( rules ) {
    
    this.type = "and";
    this.rules = rules;
    
  }
  
}


class OptionalRule {
  
  constructor( rule ) {
    
    this.type = "optional";
    this.rule = rule;
    
  }
  
}


class RepetitionRule {
  
  constructor( min, max, rule ) {
    
    this.type = "repetition";
    this.min = min;
    this.max = max;
    this.rule = rule;
    
  }
  
}


class CaseSensitiveStringRule {
  
  constructor( str ) {
    
    this.type = "case-sensitive-string";
    this.str = str;
    
  }
  
}


class CaseInsensitiveStringRule {
  
  constructor( str ) {
    
    this.type = "case-insensitive-string";
    this.str = str;
    
  }
  
}

var fs = require("fs");

var abnfStr = fs.readFileSync( "test/abnf.txt", { encoding: "utf-8" } );
var parser = new Parser( abnfStr );
module.exports = parser;
