import CaskFs from '../index.js';
const caskFs = new CaskFs({dbPool: true});
console.log('Disabling ACL for all api endpoints while in early development...');
console.log('YOU SHALL PASS');
caskFs.acl.enabled = false;
export default caskFs;
