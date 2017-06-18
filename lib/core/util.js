export function nameFrom( token ) {
  return token.val[0] === "<" ? token.val.slice( 1, -1 ) : token.val;
}


export function pad( str, len ) {
  return " ".repeat( len - str.toString().length ) + str;
}