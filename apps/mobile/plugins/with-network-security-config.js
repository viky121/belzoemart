// Development-variant only (design §13.3): allow cleartext HTTP to an explicit host list and
// keep Android's default (cleartext blocked) for everything else. Production gets no plugin.
// Uses `expo/config-plugins` because pnpm isolation does not expose @expo/config-plugins here.
const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const IPV4_RE = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

function isValidHost(host) {
  if (typeof host !== 'string' || host.length === 0) return false;
  if (/^[\d.]+$/.test(host)) return IPV4_RE.test(host);
  return HOSTNAME_RE.test(host);
}

function buildXml(hosts) {
  const domains = hosts
    .map((h) => `    <domain includeSubdomains="false">${h}</domain>`)
    .join('\n');
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<network-security-config>',
    '  <base-config cleartextTrafficPermitted="false" />',
    '  <domain-config cleartextTrafficPermitted="true">',
    domains,
    '  </domain-config>',
    '</network-security-config>',
    '',
  ].join('\n');
}

function withNetworkSecurityConfig(config, props = {}) {
  const hosts = Array.isArray(props.cleartextHosts) ? props.cleartextHosts : [];
  if (hosts.length === 0) {
    throw new Error('with-network-security-config: cleartextHosts must be a non-empty array');
  }
  const bad = hosts.filter((h) => !isValidHost(h));
  if (bad.length > 0) {
    throw new Error(
      `with-network-security-config: invalid cleartext host(s): ${bad.join(', ')} ` +
        '(hostname or IPv4 only)',
    );
  }

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'network_security_config.xml'), buildXml(hosts));
      return cfg;
    },
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application && cfg.modResults.manifest.application[0];
    if (!app) throw new Error('with-network-security-config: AndroidManifest has no <application>');
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return cfg;
  });

  return config;
}

module.exports = withNetworkSecurityConfig;
module.exports.isValidHost = isValidHost;
module.exports.buildXml = buildXml;
