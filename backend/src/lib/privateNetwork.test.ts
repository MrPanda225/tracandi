import { describe, expect, it } from 'vitest';
import { isPrivateHost } from './privateNetwork.js';

describe('isPrivateHost', () => {
  it.each([
    'localhost',
    'api.localhost',
    '127.0.0.1',
    '127.8.9.10',
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.54',
    '169.254.10.20',
    '100.64.0.1',
    '100.127.255.255',
    'ollama.homelab.lan',
    'nas.local',
    'ia.internal',
    'ia.home.arpa',
    '[::1]',
    '[fd12:3456:789a::1]',
    '[fe80::1]',
  ])('[ENF-SEC-24] reads %s as a private network address', (host) => {
    expect(isPrivateHost(host)).toBe(true);
  });

  it.each([
    'example.com',
    'ia.example.lan.example.org',
    '8.8.8.8',
    '1.1.1.1',
    '172.15.0.1',
    '172.32.0.1',
    '192.169.0.1',
    '100.63.255.255',
    '100.128.0.1',
    '11.0.0.1',
    '[2001:4860:4860::8888]',
    '256.1.1.1',
    '10.0.0',
    '',
  ])('[ENF-SEC-24] reads %s as a public address', (host) => {
    expect(isPrivateHost(host)).toBe(false);
  });

  it('[ENF-SEC-24] does not mistake a public host for a private one by its name or its case', () => {
    expect(isPrivateHost('LOCALHOST.example.com')).toBe(false);
    expect(isPrivateHost('LocalHost')).toBe(true);
    expect(isPrivateHost('Nas.LAN')).toBe(true);
  });
});
