/**
 * @file demoAuditoria.js
 * @description Script para la defensa universitaria en la UPE.
 *              Demuestra el poder de Data Anchoring y el Efecto Avalancha de SHA-256
 *              sobre los datos que la aplicación realmente tiene en su base:
 *              1. Audita un registro íntegro contra Ethereum Sepolia.
 *              2. Simula la adulteración de una dosis por un cuidador infiel.
 *              3. Audita un registro que nunca fue anclado, para mostrar que la
 *                 ausencia de anclaje no es lo mismo que una alteración.
 * @institution Universidad Provincial de Ezeiza (UPE) - Proyecto MiMedicación
 */

const db = require("./db");
const {
  generarHashDiario,
  auditarIntegridadRegistro,
  consultarHashEnBlockchain,
  ESTADO_INTEGRO,
  ESTADO_ALTERADO,
  ESTADO_NO_ANCLADO,
} = require("./blockchainService");

const PACIENTE_ANCLADO = "PAC_001";
const PACIENTE_SIN_ANCLAR = "PAC_002";

/**
 * Lee el registro desde la misma base que usa la aplicación. Auditar una copia
 * hardcodeada medía otra cosa que la que el backend ancla: cualquier diferencia
 * de campos, fechas u observaciones cambiaba el hash y el veredicto.
 */
async function cargarRegistro(pacienteId) {
  const registro = await db.obtenerPacientePorId(pacienteId);
  if (!registro) {
    throw new Error(
      `No se encontró el paciente ${pacienteId} en la base de datos. Ejecutá 'npm run db:seed' antes de la demo.`
    );
  }
  return registro;
}

function imprimirVeredicto(auditoria) {
  const icono =
    auditoria.estado === ESTADO_INTEGRO ? "✅" : auditoria.estado === ESTADO_ALTERADO ? "❌" : "ℹ️";
  console.log(`\n📢 Resultado de Auditoría:`);
  console.log(`   Estado: ${icono} ${auditoria.estado}`);
  console.log(`   ${auditoria.diagnostico}`);
  if (auditoria.hashEnBlockchain !== undefined && auditoria.hashEnBlockchain !== null) {
    console.log(`   Hash anclado en Sepolia: ${auditoria.hashEnBlockchain}`);
  }
}

async function main() {
  console.log("==========================================================================");
  console.log(" 🏥 PROYECTO MIMEDICACIÓN - UNIVERSIDAD PROVINCIAL DE EZEIZA (UPE)");
  console.log(" 🛡️ DEMOSTRACIÓN EN VIVO: AUDITORÍA CRIPTOGRÁFICA Y DETECCIÓN DE FRAUDE");
  console.log("==========================================================================\n");

  const registro = await cargarRegistro(PACIENTE_ANCLADO);
  const hashOriginal = generarHashDiario(registro);

  // ------------------------------------------------------------------
  console.log("📋 ESCENARIO A: Verificación de un Registro Genuino");
  console.log("--------------------------------------------------------------------------");
  console.log(`🔹 Paciente ID: ${registro.paciente}`);
  console.log(`🔹 Fecha del registro: ${registro.fecha}`);
  console.log(`🔹 Hash SHA-256 calculado desde la base:\n    ${hashOriginal}`);

  try {
    const consulta = await consultarHashEnBlockchain(registro.paciente, registro.fecha);
    console.log(`🔹 Hash notariado en Ethereum Sepolia:\n    ${consulta.hashRegistro}`);
    console.log(`🔹 Timestamp de minado: ${consulta.fechaLegible}`);
  } catch (error) {
    console.warn(`⚠️ No se pudo leer el anclaje on-chain (${error.message}).`);
    console.warn(`   Revisá .env y la conexión a la red antes de la defensa.\n`);
  }

  imprimirVeredicto(await auditarIntegridadRegistro(registro));

  // ------------------------------------------------------------------
  console.log("\n==========================================================================");
  console.log(" 🚨 ESCENARIO B: Simulación de Ataque / Adulteración de la Base de Datos");
  console.log(`    (Un cuidador altera la primera toma de ${registro.paciente} sin autorización)`);
  console.log("--------------------------------------------------------------------------");

  const registroAdulterado = JSON.parse(JSON.stringify(registro));
  if (registroAdulterado.tomas.length > 0) {
    registroAdulterado.tomas[0].medicamento = "Enalapril 20 mg (Registro Manipulado)";
  }
  const hashAdulterado = generarHashDiario(registroAdulterado);

  console.log(`🔸 Hash legítimo original : ${hashOriginal}`);
  console.log(`🔸 Hash del dato alterado : ${hashAdulterado}`);
  console.log(`\n🔍 Observación Criptográfica (Efecto Avalancha):`);
  console.log(`   Cambiar una sola dosis altera el 100% de la cadena hexadecimal.`);

  imprimirVeredicto(await auditarIntegridadRegistro(registroAdulterado));

  // ------------------------------------------------------------------
  console.log("\n==========================================================================");
  console.log(" ℹ️ ESCENARIO C: Registro que nunca fue anclado");
  console.log("    (La ausencia de anclaje NO es un fraude, y el sistema no lo reporta como tal)");
  console.log("--------------------------------------------------------------------------");

  const sinAnclar = await cargarRegistro(PACIENTE_SIN_ANCLAR);
  imprimirVeredicto(await auditarIntegridadRegistro(sinAnclar));
  console.log("==========================================================================\n");
}

main().catch((error) => {
  console.error(`\n❌ ${error.message}`);
  process.exitCode = 1;
});
