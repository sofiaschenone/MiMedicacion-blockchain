/**
 * @file server.js
 * @description Servidor web HTTP y API REST para MiMedicación.
 *              Conecta la interfaz de usuario con la base de datos (MongoDB Atlas / Local)
 *              y la capa de notarización criptográfica en Ethereum Sepolia.
 * @institution Universidad Provincial de Ezeiza (UPE)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
require("dotenv").config();

const {
  generarHashDiario,
  guardarHashEnBlockchain,
  consultarHashEnBlockchain,
  auditarIntegridadRegistro,
} = require("./blockchainService");

const db = require("./db");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "../public");

// Carga de información del Smart Contract
let deploymentInfo = {};
try {
  const deployPath = path.join(__dirname, "deployment-info.json");
  if (fs.existsSync(deployPath)) {
    deploymentInfo = JSON.parse(fs.readFileSync(deployPath, "utf8"));
  }
} catch (e) {}

/**
 * Responder JSON con cabeceras CORS
 */
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

/**
 * Manejador principal de peticiones (Compatible con Servidor Node y Vercel Serverless)
 */
async function requestHandler(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Manejo de Preflight CORS
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // ==========================================
  //                API REST
  // ==========================================

  // 1. Información del Sistema y Red Blockchain
  if (req.method === "GET" && pathname === "/api/info") {
    const contractAddress = process.env.CONTRACT_ADDRESS || deploymentInfo.contractAddress || "";
    return sendJSON(res, 200, {
      appName: "MiMedicación",
      subtitle: "Sistema Hospitalario de Trazabilidad y Gestión de Pacientes",
      institucion: "Universidad Provincial de Ezeiza (UPE)",
      network: "Ethereum Sepolia Testnet",
      chainId: 11155111,
      contractAddress: contractAddress,
      deployer: deploymentInfo.deployer || "Backend Autorizado",
      explorerBaseUrl: "https://sepolia.etherscan.io",
      contractUrl: contractAddress ? `https://sepolia.etherscan.io/address/${contractAddress}` : null,
      database: db.obtenerEstadoDB(),
    });
  }

  // 2. Obtener lista de pacientes desde la Base de Datos (Cloud / Local)
  if (req.method === "GET" && pathname === "/api/pacientes") {
    try {
      const pacientes = await db.obtenerTodosLosPacientes();
      return sendJSON(res, 200, pacientes);
    } catch (err) {
      return sendJSON(res, 500, { error: err.message });
    }
  }

  // 3. Agregar una nueva toma a un paciente (Persistencia real)
  if (req.method === "POST" && pathname === "/api/tomas") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const { pacienteId, medicamento, dosis, horaProgramada, observaciones } = payload;

        if (!pacienteId || !medicamento || !dosis) {
          return sendJSON(res, 400, { error: "Faltan campos obligatorios (pacienteId, medicamento, dosis)." });
        }

        const actualizado = await db.agregarToma(pacienteId, {
          medicamento,
          dosis,
          horaProgramada: horaProgramada || "12:00",
          observaciones: observaciones || "Administración indicada por profesional de la salud.",
          estado: "TOMADO",
        });

        return sendJSON(res, 201, actualizado);
      } catch (err) {
        return sendJSON(res, 500, { error: err.message });
      }
    });
    return;
  }

  // 4. Cambiar estado de una toma (TOMADO <-> PENDIENTE)
  if (req.method === "PATCH" && pathname === "/api/tomas") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const { pacienteId, tomaId, nuevoEstado } = payload;

        const actualizado = await db.actualizarEstadoToma(pacienteId, tomaId, nuevoEstado);
        return sendJSON(res, 200, actualizado);
      } catch (err) {
        return sendJSON(res, 500, { error: err.message });
      }
    });
    return;
  }

  // 5. Generar vista previa de hash
  if (req.method === "GET" && pathname === "/api/hash") {
    const pacienteId = parsedUrl.query.paciente || "PAC_001";
    const paciente = await db.obtenerPacientePorId(pacienteId);
    if (!paciente) return sendJSON(res, 404, { error: "Paciente no encontrado" });

    const hash = generarHashDiario(paciente);
    return sendJSON(res, 200, { pacienteId, fecha: paciente.fecha, hash });
  }

  // 6. Anclar registro en la Blockchain
  if (req.method === "POST" && pathname === "/api/anclar") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const pacienteId = payload.paciente || "PAC_001";
        const paciente = await db.obtenerPacientePorId(pacienteId);

        if (!paciente) {
          return sendJSON(res, 404, { error: "Paciente no encontrado en la base de datos." });
        }

        const hash = generarHashDiario(paciente);
        console.log(`[API /api/anclar] Anclando registro para ${pacienteId}... Hash: ${hash}`);

        const resultado = await guardarHashEnBlockchain(paciente.paciente, paciente.fecha, hash);
        return sendJSON(res, 200, resultado);
      } catch (error) {
        console.error("[API /api/anclar] Error:", error.message);
        return sendJSON(res, 400, { error: error.message });
      }
    });
    return;
  }

  // 7. Auditar integridad
  if (req.method === "POST" && pathname === "/api/auditar") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const pacienteId = payload.paciente || "PAC_001";
        const simularAdulteracion = payload.simularAdulteracion === true;

        const paciente = await db.obtenerPacientePorId(pacienteId);
        if (!paciente) {
          return sendJSON(res, 404, { error: "Paciente no encontrado" });
        }

        // Clonar datos
        const registroParaAuditar = JSON.parse(JSON.stringify(paciente));

        if (simularAdulteracion && registroParaAuditar.tomas.length > 0) {
          registroParaAuditar.tomas[0].medicamento = "Enalapril 20 mg (Registro Manipulado)";
        }

        const auditoria = await auditarIntegridadRegistro(registroParaAuditar);

        let onChainData = null;
        try {
          onChainData = await consultarHashEnBlockchain(paciente.paciente, paciente.fecha);
        } catch (e) {}

        return sendJSON(res, 200, {
          ...auditoria,
          simulacionAdulterada: simularAdulteracion,
          medicamentoAuditado: registroParaAuditar.tomas[0]?.medicamento,
          hashEnBlockchain: onChainData ? onChainData.hashRegistro : null,
          timestampBlockchain: onChainData ? onChainData.fechaLegible : null,
        });
      } catch (error) {
        console.error("[API /api/auditar] Error:", error.message);
        return sendJSON(res, 400, { error: error.message });
      }
    });
    return;
  }

  // ==========================================
  //          ARCHIVOS ESTÁTICOS (FRONTEND)
  // ==========================================
  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, "index.html");
    }

    const extname = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpg",
      ".svg": "image/svg+xml",
    };

    const contentType = mimeTypes[extname] || "application/octet-stream";

    fs.readFile(filePath, (error, content) => {
      if (error) {
        res.writeHead(500);
        res.end(`Error: ${error.code}`);
      } else {
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content, "utf-8");
      }
    });
  });
}

const server = http.createServer(requestHandler);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log("\n==========================================================================");
    console.log(" 🏥 PROYECTO MIMEDICACIÓN - UNIVERSIDAD PROVINCIAL DE EZEIZA (UPE)");
    console.log(` 🌐 Servidor Web & API corriendo exitosamente`);
    console.log(` 👉 ABRE EN TU NAVEGADOR: http://localhost:${PORT}`);
    console.log("==========================================================================\n");
  });
}

module.exports = { server, requestHandler };
