class MimeTypeUtils {

  previewType(mimeType) {
    if ( !mimeType || typeof mimeType !== 'string' ) return false;
  
    // strip parameters: "type/subtype; charset=utf-8" -> "type/subtype"
    const [type] = mimeType.toLowerCase().split(';', 1);

    if (type === 'image/tiff' || type === 'image/x-tiff') return false;

    // images
    if (type.startsWith('image/')) return 'image';

    // json types
    if (
      type === 'application/json' ||
      type === 'application/ld+json' ||
      type.endsWith('+json')
    ) {
      return 'json';
    }

    // text/*
    if (type.startsWith('text/')) return 'text';

    // common text-like application types
    if (
      type === 'application/xml' ||
      type === 'application/xhtml+xml' ||
      type === 'application/javascript' ||
      type === 'application/x-javascript' ||
      type === 'application/x-www-form-urlencoded' ||
      type.endsWith('+xml')
    ) {
      return 'text';
    }

    // audio
    if (type.startsWith('audio/')) return 'audio';

    // video
    if (type.startsWith('video/')) return 'video';

    return false;
  }

}

export default new MimeTypeUtils();