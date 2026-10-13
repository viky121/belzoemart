/* eslint-disable @typescript-eslint/no-require-imports */
import { BELZO_LOGO_XML } from '../belzo-logo.generated';

declare const __dirname: string;

const fs = require('fs') as { readFileSync: (p: string, enc: string) => string };
const pathLib = require('path') as { resolve: (...p: string[]) => string };

describe('brand logo drift', () => {
  it('embedded XML equals apps/web/public/belzo-logo.svg (run brand:sync if this fails)', () => {
    const webSvg = pathLib.resolve(__dirname, '../../../../../web/public/belzo-logo.svg');
    const source = fs.readFileSync(webSvg, 'utf8').replace(/\r\n/g, '\n');
    expect(BELZO_LOGO_XML).toBe(source);
  });
});
