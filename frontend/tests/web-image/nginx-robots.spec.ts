// tests/web-image/nginx-robots.spec.ts — the web image turns every robot away (MIM-423).
//
// The demo shop must not reach a search engine: the image serves a
// robots.txt that disallows every path to every robot, and every page and
// static file carries X-Robots-Tag: noindex, nofollow through the shared
// security-headers snippet. /api/ responses are the backend's own (ADR 0018).

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

const NGINX_DIR = resolve(__dirname, '../../nginx');
const DOCKERFILE_PATH = resolve(__dirname, '../../Dockerfile');
const SNIPPET_INCLUDE = 'include /etc/nginx/snippets/security-headers.conf;';

describe('web image robots', () => {
  let robots: string;
  let headers: string;
  let template: string;
  let dockerfile: string;

  beforeAll(async () => {
    robots = await readFile(resolve(NGINX_DIR, 'robots.txt'), 'utf-8').catch(() => '');
    headers = await readFile(resolve(NGINX_DIR, 'security-headers.conf'), 'utf-8');
    template = await readFile(resolve(NGINX_DIR, 'default.conf.template'), 'utf-8');
    dockerfile = await readFile(DOCKERFILE_PATH, 'utf-8');
  });

  it('robots.txt disallows every path to every robot', () => {
    expect(robots).toBe('User-agent: *\nDisallow: /\n');
  });

  it('the image copies robots.txt into the web root after the app copies', () => {
    const robotsCopy = dockerfile.indexOf('COPY nginx/robots.txt /usr/share/nginx/html/robots.txt');
    const lastAppCopy = dockerfile.indexOf('COPY --from=build /app/dist/demo-payment/browser/');
    expect(robotsCopy).toBeGreaterThan(lastAppCopy);
    expect(lastAppCopy).toBeGreaterThan(-1);
  });

  it('the security-headers snippet sends X-Robots-Tag noindex, nofollow always', () => {
    expect(headers).toContain('add_header X-Robots-Tag "noindex, nofollow" always;');
  });

  it('every location outside /api/ includes the security-headers snippet', () => {
    const locations = template.match(/^\s*location\b/gm) ?? [];
    const includes = template.split(SNIPPET_INCLUDE).length - 1;
    expect(locations).toHaveLength(6);
    expect(includes).toBe(5);
  });
});
