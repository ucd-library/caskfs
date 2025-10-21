import {PayloadUtils} from '@ucd-lib/cork-app-utils'

const ID_ORDER = ['path', 'softDelete', 'action'];

let inst = new PayloadUtils({
  idParts: ID_ORDER
});

export default inst;