import {execFileSync} from 'node:child_process';
import {appendFileSync, readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const full = {lane: 'full', matrix: true};
const docs = /^(?:README(?:\.[^/]*)?\.md|CONTRIBUTING\.md|CHANGELOG\.md|LICENSE(?:\.[^/]*)?|docs\/[\s\S]+|\.github\/ISSUE_TEMPLATE\/[\s\S]+)$/;

export function classifyChanges(diff) {
  if (!diff || !diff.endsWith('\0')) return full;
  const fields = diff.slice(0, -1).split('\0');
  const paths = [];
  while (fields.length) {
    const status = fields.shift();
    const count = /^[RC]\d+$/.test(status) ? 2 : /^[ADMTUXB]$/.test(status) ? 1 : 0;
    if (!count || fields.length < count) return full;
    const changed = fields.splice(0, count);
    if (changed.some(path => !path)) return full;
    paths.push(...changed);
  }
  return {
    lane: paths.every(path => docs.test(path)) ? 'docs' : 'full',
    matrix: paths.some(path => path.endsWith('.css') || /^(?:src\/ui\/|src\/shell\/)/.test(path))
  };
}

export function detectChanges(base, head, git = args => execFileSync('git', args, {encoding: 'utf8', maxBuffer: 10 * 1024 * 1024})) {
  if (![base, head].every(sha => /^[a-f0-9]{40,64}$/.test(sha ?? ''))) return full;
  try {
    let ancestor;
    try {
      ancestor = git(['merge-base', base, head]).trim();
    } catch {
      git(['fetch', '--no-tags', '--depth=64', 'origin', base, head]);
      try {
        ancestor = git(['merge-base', base, head]).trim();
      } catch {
        git(['fetch', '--no-tags', '--unshallow', 'origin', base, head]);
        ancestor = git(['merge-base', base, head]).trim();
      }
    }
    if (!/^[a-f0-9]{40,64}$/.test(ancestor)) return full;
    return classifyChanges(git(['diff', '--name-status', '-z', '-M', ancestor, head]));
  } catch {
    return full;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result = full;
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    try {
      const {pull_request: pr} = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
      result = detectChanges(pr.base.sha, pr.head.sha);
    } catch {
      result = full;
    }
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `lane=${result.lane}\nmatrix=${result.matrix}\n`);
}
