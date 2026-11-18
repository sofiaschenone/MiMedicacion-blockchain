/**
 * @file demoAuditoria.js
 * @description Script interactivo para la defensa universitaria en la UPE.
 *              Demuestra el poder de Data Anchoring y el Efecto Avalancha de SHA-256:
 *              1. Valida un registro íntegro contra Ethereum Sepolia.
 *              2. Simula la adulteración de un registro en la base de datos por un atacante o cuidador infiel.
 *              3. Demuestra cómo la blockchain expone el fraude de inmediato.
 * @institution Universidad Provincial de Ezeiza (UPE) - Proyecto MiMedicación
 */

const { generarHashDiario, auditarIntegridadRegistro, consultarHashEnBlockchain } = require("./blockchainService");

async function main() {
  console.log("==========================================================================");
  console.log(" 🏥 PROYECTO MIMEDICACIÓN - UNIVERSIDAD PROVINCIAL DE EZEIZA (UPE)");
  console.log(" 🛡️ DEMOSTRACIÓN EN VIVO: AUDITORÍA CRIPTOGRÁFICA Y DETECCIÓN DE FRAUDE");
  console.log("==========================================================================\n");

  const fechaHoy = new Date().toISOString().split("T")[0];
  const pacienteId = "PAC_001";

  // 1. Registro legítimo original (el mismo que se selló en el Cron Job)
  const registroOriginal = {
    paciente: pacienteId,
    nombrePaciente: "Carlos Alberto Martínez",
    edad: 82,
    fecha: fechaHoy,
    cuidadorResponsable: "Enfermera Lic. Mariana López (Mat. 44.912)",
    tomas: [
      {
        horaProgramada: "08:00",
        horaEfectiva: "08:05",
        medicamento: "Enalapril 10 mg",
        dosis: "1 comprimido",
        estado: "TOMADO",
        observaciones: "Tomado con vaso de agua en ayunas. Sin molestias."
      },
      {
        horaProgramada: "13:00",
        horaEfectiva: "13:15",
        medicamento: "Metformina 850 mg",
        dosis: "1 comprimido",
        estado: "TOMADO",
        observaciones: "Tomado junto al almuerzo."
      },
      {
        horaProgramada: "21:00",
        horaEfectiva: "21:02",
        medicamento: "Atorvastatina 20 mg",
        dosis: "1 comprimido",
        estado: "TOMADO",
        observaciones: "Toma nocturna antes de dormir."
      }
    ]
  };

  console.log("📋 ESCENARIO A: Verificación de un Registro Genuino");
  console.log("--------------------------------------------------------------------------");
  const hashOriginal = generarHashDiario(registroOriginal);
  console.log(`🔹 Paciente ID: ${pacienteId}`);
  console.log(`🔹 Fecha: ${fechaHoy}`);
  console.log(`🔹 Hash SHA-256 Calculado en Memoria:\n    ${hashOriginal}`);

  try {
    const consultaOnChain = await consultarHashEnBlockchain(pacienteId, fechaHoy);
    console.log(`🔹 Hash Notariado en Ethereum Sepolia:\n    ${consultaOnChain.hashRegistro}`);
    console.log(`🔹 Timestamp de Minado: ${consultaOnChain.fechaLegible}`);

    const auditoria1 = await auditarIntegridadRegistro(registroOriginal);
    console.log(`\n📢 Resultado de Auditoría:`);
    console.log(`   ${auditoria1.diagnostico}`);
    console.log(`   ¿Es íntegro? => ${auditoria1.esIntegro ? "✅ SÍ (100% Auténtico)" : "❌ NO"}\n`);
  } catch (error) {
    console.warn(`⚠️ Nota: Si aún no desplegaste o no corriste el cron hoy, recuerda correr 'npm run cron:test' primero.`);
    console.warn(`   Detalle: ${error.message}\n`);
    return;
  }

  console.log("==========================================================================");
  console.log(" 🚨 ESCENARIO B: Simulación de Ataque / Adulteración de la Base de Datos");
  console.log("    (Un cuidador altera la dosis de 'Enalapril 10 mg' a '20 mg' sin autorización)");
  console.log("--------------------------------------------------------------------------");

  // Clonamos el registro y modificamos ÚNICAMENTE un número (de 10 mg a 20 mg)
  const registroAdulterado = JSON.parse(JSON.stringify(registroOriginal));
  registroAdulterado.tomas[0].medicamento = "Enalapril 20 mg"; // Alteración maliciosa

  const hashAdulterado = generarHashDiario(registroAdulterado);
  console.log(`🔸 Hash Legítimo Original : ${hashOriginal}`);
  console.log(`🔸 Hash del Dato Alterado : ${hashAdulterado}`);
  console.log(`\n🔍 Observación Criptográfica (Efecto Avalancha):`);
  console.log(`   Modificar un solo dígito ('1' por '2') cambió el 100% de la cadena hexadecimal.`);

  const auditoria2 = await auditarIntegridadRegistro(registroAdulterado);
  console.log(`\n📢 Resultado de Auditoría del Registro Alterado:`);
  console.log(`   ${auditoria2.diagnostico}`);
  console.log(`   ¿Es íntegro? => ${auditoria2.esIntegro ? "✅ SÍ" : "❌ FRAUDE DETECTADO (Rechazado)"}`);
  console.log("==========================================================================\n");
}

main().catch(console.error);
