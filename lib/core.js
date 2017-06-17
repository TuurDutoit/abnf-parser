function pad( str, len ) {
  return " ".repeat( len - str.toString().length ) + str;
}


const Range = class RasperRange extends Array {
  
  constructor( min, max, increment = 1 ) {
    let len = ( max - min ) / increment + 1;
    
    super( len );
    
    for ( let i = 0; i < len; i++ ) {
      this[ i ] = min + i * increment;
    }
    
  }
  
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
  
}


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
  
}


export { Range, RasperError, SyntaxError, Token };