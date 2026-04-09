#!/usr/bin/env node
/**
 * Crea un usuario en la DB con contraseña aleatoria.
 *
 * Uso:
 *   node scripts/create-user.js                  → te pregunta el username
 *   node scripts/create-user.js <username>        → usa el username dado
 */
require('dotenv').config();
const crypto    = require('crypto');
const readline  = require('readline');
const { connectDB } = require('../src/db');
const User          = require('../src/models/User');

function randomPassword(len = 16) {
  return crypto.randomBytes(len).toString('base64url').slice(0, len);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

async function main() {
  let username = process.argv[2];

  if (!username) {
    username = await ask('  Nombre de usuario: ');
  }

  username = username.toLowerCase().trim();

  if (!username) {
    console.error('❌  El nombre de usuario no puede estar vacío.');
    process.exit(1);
  }

  const password = randomPassword(16);

  await connectDB();

  const existing = await User.findOne({ username });
  if (existing) {
    console.error(`\n❌  El usuario "${username}" ya existe.\n`);
    process.exit(1);
  }

  const passwordHash = User.hashPassword(password);
  await User.create({ username, passwordHash });

  console.log('\n✅  Usuario creado exitosamente');
  console.log('─'.repeat(44));
  console.log(`   Usuario   : ${username}`);
  console.log(`   Contraseña: ${password}`);
  console.log('─'.repeat(44));
  console.log('⚠️   Guarda esta contraseña, no se puede recuperar.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
