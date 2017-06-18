import { SyntaxError } from "./error";

export { Range, Token, Source, SimpleSource };

const ANY_WHITESPACE = /^\s*/;


const Range = class RasperRange extends Array {
  
  constructor( min, max, increment = 1 ) {
    let len = ( max - min ) / increment + 1;
    
    super( len );
    
    for ( let i = 0; i < len; i++ ) {
      this[ i ] = min + i * increment;
    }
    
  }
  
}


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
  
}


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
  
}


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
  
}