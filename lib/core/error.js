import { pad } from "./util";

export { RasperError, ImplementationError, SyntaxError };


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


const ImplementationError = class RasperImplementationError extends RasperError {
  
  constructor( message ) {
    super( message, "ImplementationError" );
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
  
}