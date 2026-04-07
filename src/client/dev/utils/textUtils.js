class TextUtils {

  /**
   * @description Formats a (potentially truncated) JSON string with indentation,
   * mimicking JSON.stringify pretty-printing without requiring valid/complete JSON.
   * Walks the string character by character, tracking depth and skipping whitespace
   * outside of string literals.
   * @param {String} str - raw JSON string, possibly truncated
   * @param {Number} indent - number of spaces per indent level
   * @returns {String} formatted string
   */
  formatPartialJson(str, indent=2) {
    let result = '';
    let level = 0;
    let inString = false;
    const pad = n => ' '.repeat(n * indent);

    for ( let i = 0; i < str.length; i++ ) {
      const ch = str[i];

      if ( inString ) {
        result += ch;
        if ( ch === '\\' ) result += str[++i];
        else if ( ch === '"' ) inString = false;
        continue;
      }

      switch (ch) {
        case '"':
          inString = true;
          result += ch;
          break;
        case '{':
        case '[':
          result += ch + '\n' + pad(++level);
          break;
        case '}':
        case ']':
          result += '\n' + pad(--level) + ch;
          break;
        case ',':
          result += ch + '\n' + pad(level);
          break;
        case ':':
          result += ': ';
          break;
        case ' ':
        case '\t':
        case '\n':
        case '\r':
          break;
        default:
          result += ch;
      }
    }

    return result;
  }
}

export default new TextUtils();