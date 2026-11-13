/**
 * @file cron.js
 * @description Proceso en segundo plano (Daemon / Cron Job) para la automatización diaria de Data Anchoring.
 *              Simula la recolección de tomas de la base de datos a las 23:59 de cada día,
 *              genera su comprobante criptográfico SHA-256 y lo sella en Ethereum Sepolia.
 * @institution Universidad Provincial de Ezeiza (UPE) - Proyecto MiMedicación
 */

const cron = require("node-cron");
const { generarHashDiario, guardarHashEnBlockchain } = require("./blockchainService");

/**
 * Función que simula la consulta a la base de datos relacional/NoSQL del backend
 * (por ejemplo MongoDB o PostgreSQL) para recuperar todas las tomas registradas en el día
 * por los cuidadores y adultos mayores.
 *
 * @param {string} fecha - Fecha en formato "YYYY-MM-DD"
 * @returns {Array<Object>} Lista de registros agrupados por paciente
 */
function obtenerTomasDelDiaDeBaseDeDatos(fecha) {
  console.log(`[BaseDeDatos] Consultando registros diarios para la fecha: ${fecha}...`);

  // Datos simulados de ejemplo representativos de adultos mayores en la app MiMedicación
  return [
    {
      paciente: "PAC_001",
      nombrePaciente: "Carlos Alberto Martínez",
      edad: 82,
      fecha: fecha,
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
    },
    {
      paciente: "PAC_002",
      nombrePaciente: "Rosa Nelida Fernández",
      edad: 77,
      fecha: fecha,
      cuidadorResponsable: "Hijo / Cuidador Familiar: Jorge Fernández",
      tomas: [
        {
          horaProgramada: "07:30",
          horaEfectiva: "07:32",
          medicamento: "Levotiroxina 50 mcg",
          dosis: "1 comprimido",
          estado: "TOMADO",
          observaciones: "Media hora antes del desayuno habitual."
        },
        {
          horaProgramada: "20:00",
          horaEfectiva: "20:30",
          medicamento: "Losartán 50 mg",
          dosis: "1 comprimido",
          estado: "TOMADO",
          observaciones: "Presión arterial controlada: 125/80 mmHg."
        }
      ]
    }
  ];
}

/**
 * Función principal que orquesta el anclaje criptográfico de todos los pacientes.
 */
async function ejecutarAnclajeDiario() {
  const hoy = new Date().toISOString().split("T")[0]; // Formato "YYYY-MM-DD"
  
  console.log("\n========================================================================");
  console.log(`⏰ [CRON JOB INICIADO] Proceso de Cierre Diario y Notariado Blockchain`);
  console.log(`📅 Fecha de procesamiento: ${hoy}`);
  console.log(`🕒 Hora de ejecución: ${new Date().toLocaleTimeString("es-AR")}`);
  console.log("========================================================================\n");

  try {
    // 1. Obtener registros consolidados del día desde la base de datos
    const registrosPacientes = obtenerTomasDelDiaDeBaseDeDatos(hoy);
    console.log(`[Cron] Se encontraron ${registrosPacientes.length} pacientes con actividad en el día.\n`);

    // 2. Procesar paciente por paciente
    for (const datosPaciente of registrosPacientes) {
      console.log(`------------------------------------------------------------------------`);
      console.log(`👤 Procesando Paciente: ${datosPaciente.paciente} (${datosPaciente.nombrePaciente})`);

      // A. Generación del Hash criptográfico SHA-256 (Off-chain)
      const hashCalculado = generarHashDiario(datosPaciente);
      console.log(`🔒 Hash Criptográfico SHA-256 generado localmente:`);
      console.log(`   ${hashCalculado}`);

      // B. Anclaje inmutable en Sepolia (On-chain)
      try {
        const resultado = await guardarHashEnBlockchain(
          datosPaciente.paciente,
          datosPaciente.fecha,
          hashCalculado
        );

        console.log(`✅ Registro notariado con éxito en la Blockchain!`);
        console.log(`   Tx Hash: ${resultado.transactionHash}`);
        console.log(`   Bloque : ${resultado.blockNumber}`);
        console.log(`   Enlace : ${resultado.explorerUrl}`);
      } catch (errBlockchain) {
        console.error(`❌ Error al notariar paciente ${datosPaciente.paciente}: ${errBlockchain.message}`);
        // En producción se registraría en un sistema de alertas (Sentry, Slack, etc.)
      }
    }

    console.log("\n========================================================================");
    console.log("🎉 [CRON JOB FINALIZADO] Todos los lotes del día fueron procesados.");
    console.log("========================================================================\n");
  } catch (error) {
    console.error("[Cron] Error crítico durante la ejecución del proceso diario:", error);
  }
}

// ==============================================================================
// PROGRAMACIÓN DEL CRON JOB (node-cron)
// Expresión: "59 23 * * *" -> Ejecuta a las 23:59 todos los días
// Formato: segundo(opcional) minuto hora dia_del_mes mes dia_de_la_semana
// ==============================================================================
const CRON_EXPRESSION = "59 23 * * *";

console.log("🚀 Servicio de Automatización MiMedicación iniciado.");
console.log(`⏳ Tarea programada configurada con cron expression: '${CRON_EXPRESSION}' (Todos los días a las 23:59hs)`);

cron.schedule(CRON_EXPRESSION, async () => {
  console.log("[Planificador] Son las 23:59. Disparando rutina de anclaje diario...");
  await ejecutarAnclajeDiario();
});

// Soporte para ejecución inmediata en vivo (para demostración en clase o tests)
// Ejecutar con: node src/cron.js --now
if (process.argv.includes("--now") || process.argv.includes("--test")) {
  console.log("⚡ Flag de ejecución inmediata detectado (--now). Corriendo simulación de demostración ahora...");
  ejecutarAnclajeDiario().then(() => {
    console.log("Demostración finalizada. Manteniendo listener activo...");
  });
}
