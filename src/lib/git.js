import path from 'path';
import { exec as _exec } from 'child_process';

class Git {

  constructor() {
    this.cache = {};
  }

  async info(filePath) {
    // get root dir for the file
    let dir;
    try {
      let resp = await exec(`git -C ${path.dirname(filePath)} rev-parse --show-toplevel`);
      dir = resp.stdout.trim();
    } catch(e) {
      return null;
    }

    // check if file is not in git ignore
    let relPath = path.relative(dir, filePath);
    try {
      resp = await exec(`git -C ${dir} ls-files --error-unmatch ${relPath}`);
    } catch(e) {
      return null;
    }


    if( this.cache[dir] ) {
      return this.cache[dir];
    }

    resp = await exec(`git -C ${dir} remote -v`);

    let remote = resp.stdout.split('\n')[0]
                            .split('\t')[1]
                            .replace(/\s.*/, '')
                            .replace(/.git$/, '');
    let httpRemote = remote;

    // format the git@ remotes to https://
    if( httpRemote.match(/^git@/) ) {
      remote = remote.replace(/:\/?/, ':')
      httpRemote = remote;
      httpRemote = httpRemote.replace(':', '/')
        .replace(/^git@/, 'https://')
    }

    // get latest commit hash
    resp = await exec(`git -C ${dir} log -1 --pretty=%h`);
    let commit = resp.stdout.trim();

    // get tag(s) if exists
    let tag = '';
    try {
      resp = await exec(`git -C ${dir} tag --contains HEAD`);
      let tags = resp.stdout.split('\n').map(t => t.trim()).filter(t => t);
      tag = tags.join(', ');
    } catch(e) {}

    // get current branch
    resp = await exec(`git -C ${dir} rev-parse --abbrev-ref HEAD`);
    let branch = resp.stdout.trim();

    // get last commit time
    resp = await exec(`git -C ${dir} log -1 --pretty=format:"%ct"`);
    let date = new Date(parseInt(resp.stdout.trim()) * 1000).toISOString();

    let data = {remote: httpRemote, commit, tag, branch, lastCommitTime: date, root: dir};
    this.cache[dir] = data;
    return data;
  }
}

async function exec(params) {
  return new Promise((resolve, reject) => {
    _exec(params, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      resolve({stdout, stderr});
    });
  });
}

export default new Git();