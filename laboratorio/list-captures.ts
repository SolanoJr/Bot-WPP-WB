#!/usr/bin/env node
/**
 * laboratorio/list-captures.ts
 *
 * ListaMensagens capturadas no JSONL de capturas.
 *
 * Uso:
 *   node dist/laboratorio/list-captures.js            # todas
 *   node dist/laboratorio/list-captures.js --group JID # filtradas por grupo
 */

import { readCaptures, printCaptures, capturesByGroup } from './capture-store';
import { argv } from 'node:process';

const GROUP_JID = argv[2] === '--group' ? argv[3] : undefined;

if (GROUP_JID) {
  const entries = capturesByGroup(GROUP_JID);
  if (entries.length === 0) {
    console.log(`Nenhuma captura para o grupo ${GROUP_JID}.`);
    process.exit(0);
  }
  printCaptures(GROUP_JID);
} else {
  printCaptures();
}
