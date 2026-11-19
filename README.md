# 🏥 MiMedicación — Módulo Blockchain & Notariado Digital (Data Anchoring)

> **Proyecto Universitario:** Universidad Provincial de Ezeiza (UPE)  
> **Cátedra:** Blockchain y Sistemas Distribuidos  
> **Integrantes:** Equipo MiMedicación  
> **Red:** Ethereum Testnet (Sepolia)  

---

## 📌 ¿Qué hace este módulo y por qué se diseñó así?

**MiMedicación** es una aplicación diseñada para adultos mayores y cuidadores que garantiza la toma puntual y correcta de medicamentos.

### 🔒 Privacidad Médica y Ley de Protección de Datos (Data Anchoring)
Por normativas legales de privacidad médica (como la Ley 25.326 en Argentina o HIPAA/GDPR), **está prohibido almacenar datos clínicos o identificatorios en texto plano dentro de una blockchain pública y transparente como Ethereum**.

Para resolver esto sin perder la inmutabilidad de la red, implementamos el patrón **Data Anchoring (Anclaje de Datos)**:
1. **Off-Chain (Base de Datos):** La base de datos privada guarda el detalle operativo (nombres de pacientes, cuidadores, medicamentos, horarios).
2. **Hash Criptográfico (Node.js):** Al finalizar la jornada (23:59hs), el backend toma el JSON del paciente, lo normaliza de forma determinista y genera un **Hash SHA-256** (32 bytes).
3. **On-Chain (Smart Contract en Sepolia):** Se envía **únicamente el hash** al contrato inteligente `RegistroMedicacion.sol`, el cual actúa como un **notario digital inmutable**. Si alguien en el futuro altera una sola coma de la base de datos, el hash cambiará y el fraude quedará en evidencia de inmediato.

---

## 🗂️ Estructura del Repositorio

```text
mimedicacion-blockchain/
├── api/
│   └── index.js                  # Adaptador serverless (Vercel) hacia src/server.js
├── contracts/
│   └── RegistroMedicacion.sol    # Smart Contract en Solidity con control onlyOwner
├── data/
│   └── pacientes.json            # Base local de respaldo (fallback sin MongoDB)
├── docs/
│   ├── GUIA_DESPLIEGUE.md        # Guía técnica detallada de despliegue en Sepolia
│   ├── MANUAL_DE_USUARIO.md      # Manual de usuario con escenarios y capturas
│   └── capturas/                 # Carpeta para capturas de pantalla de la defensa
├── public/
│   ├── index.html                # Aplicación web (tablero de enfermería)
│   └── presentacion.html         # Presentación de la defensa
├── scripts/
│   ├── deploy.js                 # Script de despliegue automatizado a Sepolia
│   └── seedDatabase.js           # Carga de datos de demostración
├── src/
│   ├── blockchainService.js      # Ethers.js v6, hash SHA-256 canónico y auditoría
│   ├── contractAbi.json          # ABI oficial del contrato compilado
│   ├── cron.js                   # Automatización diaria a las 23:59hs (node-cron)
│   ├── db.js                     # Persistencia (MongoDB / Supabase / JSON local)
│   ├── demoAuditoria.js          # Demostración de adulteración y detección
│   ├── resumen.js                # Resumen del lote diario
│   ├── server.js                 # Servidor HTTP y API REST del tablero
│   ├── validacion.js             # Validación de fechas y día calendario argentino
│   └── deployment-info.json      # Metadatos del despliegue (local, no versionado)
├── test/                         # 7 suites de pruebas (122 casos)
├── hardhat.config.js             # Configuración de compilador y red Sepolia
├── package.json                  # Dependencias y scripts de ejecución
├── .env.example                  # Plantilla de variables de entorno
└── README.md                     # Esta guía
```

---

## 📋 Requisitos Previos

Antes de empezar, asegúrate de tener instalado en tu computadora:

1. **[Node.js](https://nodejs.org/)** (Versión 18, 20 o superior).
2. **[Visual Studio Code](https://code.visualstudio.com/)**.
3. **Billetera MetaMask** instalada en tu navegador (configurada en la red **Sepolia Testnet**).
4. **Fondos de prueba (Sepolia ETH gratis):**
   - [Google Cloud Web3 Sepolia Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)
   - [Alchemy Sepolia Faucet](https://sepoliafaucet.com/)
5. **Cuenta gratuita en [Alchemy](https://dashboard.alchemy.com/):** Crea una App en la red **Ethereum Sepolia** para obtener tu `API Key`.

---

## 🚀 Guía Paso a Paso para Ejecutar el Proyecto

### 1️⃣ Abrir el proyecto en VS Code
1. Abre **Visual Studio Code**.
2. Ve al menú: **`Archivo` > `Abrir carpeta...`** (`File > Open Folder...`).
3. Selecciona la carpeta donde descargaste o clonaste este repositorio.
4. Abre la terminal integrada con: **`Ctrl + Ñ`** (o menú **`Terminal` > `Nueva Terminal`**).

---

### 2️⃣ Instalar dependencias
En la terminal de VS Code, ejecuta:

```bash
npm install
```

*(Si estás en Windows PowerShell y ves una advertencia de permisos, puedes usar una terminal de **Símbolo del sistema (CMD)** o ejecutar `npm.cmd install`).*

---

### 3️⃣ Configurar el archivo de entorno `.env`
Copia el archivo de ejemplo para crear tu archivo `.env`:

```bash
# En Windows (CMD):
copy .env.example .env

# En Linux / Mac / Git Bash / PowerShell:
cp .env.example .env
```

Abre el archivo `.env` que se acaba de crear y completa tus datos:

```env
# 1. Clave privada de tu cuenta de MetaMask de pruebas (NUNCA uses una cuenta con dinero real)
# En MetaMask: Menú de cuenta > Detalles de la cuenta > Mostrar clave privada
PRIVATE_KEY=0xTU_CLAVE_PRIVADA_AQUI

# 2. Tu API Key de Alchemy para Ethereum Sepolia
ALCHEMY_API_KEY=tu_alchemy_api_key_aqui

# 3. Dirección del contrato (la completaremos en el paso 5)
CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000

# 4. (Opcional) Para verificar el contrato en Etherscan
ETHERSCAN_API_KEY=tu_api_key_de_etherscan
```

---

### 4️⃣ Compilar y ejecutar Tests Unitarios (Sin gastar gas)
Verifica que el Smart Contract compile y que todas las pruebas pasen en la máquina virtual local:

```bash
npm test
```

Deberás ver todos los tests pasando en verde (**122 casos** en 7 suites):

| Suite | Qué cubre |
| :--- | :--- |
| `RegistroMedicacion.test.js` | Contrato: owner, registro, `onlyOwner`, inmutabilidad y `verificarHash`. |
| `hash.test.js` | Determinismo de la canonicalización y del hash diario. |
| `validacion.test.js` | Fechas de registro y día calendario argentino (incluye 29 de febrero). |
| `auditoria.test.js` | Los tres estados: íntegro, alterado y no anclado. |
| `erroresAnclaje.test.js` | Cada rechazo del contrato se reporta con su causa real. |
| `resumen.test.js` | Resumen del lote: anclaje nuevo, ya anclado y fallos. |
| `cron.test.js` | Cierre del proceso diario con el resultado real del lote. |

---

### 5️⃣ Desplegar el Smart Contract en Ethereum Sepolia
Con tu wallet cargada con Sepolia ETH, ejecuta:

```bash
npm run deploy:sepolia
```

Al terminar, la consola te mostrará un mensaje como este:
```text
=================================================================
✅ ¡Contrato desplegado con éxito!
📍 Dirección del Contrato: 0x4B3e5c98A0123...C7a8
=================================================================
🔍 Ver en Etherscan: https://sepolia.etherscan.io/address/0x4B3e5c98A0123...C7a8
```

👉 **Paso fundamental:** Copia esa dirección (`0x4B3e5...`) y pégala en tu archivo `.env`:
```env
CONTRACT_ADDRESS=0x4B3e5c98A0123...C7a8
```

---

### 6️⃣ Probar la Notarización y Automatización (Cron Job)

#### A. Modo Demostración Inmediata (⚡ Para mostrar en clase a los profesores):
No es necesario esperar a las 23:59hs. Corre este comando para ver el proceso en vivo en segundos:

```bash
npm run cron:test
```

**¿Qué hace este comando?**
1. Simula las tomas de medicamentos de Don Carlos (82 años) y Doña Rosa (77 años).
2. Genera el hash criptográfico SHA-256 en tu servidor Node.js.
3. Firma la transacción con la wallet del backend y sella el hash en Sepolia.
4. Te entrega en la consola el enlace directo a **Sepolia Etherscan** para que puedas abrirlo en el navegador y mostrar la transacción confirmada.

#### B. Modo Daemon (Servicio en Segundo Plano):
Para dejar el servicio corriendo en producción:

```bash
npm run cron
```
*El sistema quedará en espera y se ejecutará automáticamente todos los días a las 23:59 hs.*

#### C. Modo Auditoría & Detección de Fraude en Vivo:
Para demostrar qué sucede si alguien intenta manipular un registro en la base de datos:

```bash
npm run demo:auditoria
```
*Lee el registro real de la base, lo compara contra la blockchain y después simula una dosis adulterada. Recorre los tres estados de auditoría: íntegro, alterado y no anclado.*

> Requiere `npm run db:seed` y que el registro de `PAC_001` esté anclado para su fecha.

---

### 7️⃣ Levantar la aplicación web (tablero de enfermería)

```bash
npm run db:seed   # carga los pacientes de demostración
npm start         # abre el tablero en http://localhost:3000
```

El tablero permite ver las tomas del día, agregar tomas, certificar el día en Sepolia y auditar la integridad con el interruptor **"Simular discrepancia en dosis médica"**.

**API REST disponible:**

| Método y ruta | Función |
| :--- | :--- |
| `GET /api/info` | Red, contrato y motor de base de datos en uso. |
| `GET /api/pacientes` | Pacientes con sus tomas. |
| `POST /api/tomas` · `PATCH /api/tomas` | Alta y actualización de tomas. |
| `GET /api/hash?paciente=&fecha=` | Hash SHA-256 canónico del registro. |
| `POST /api/anclar` | Ancla el hash del día en Sepolia. |
| `POST /api/auditar` | Audita integridad: `INTEGRO`, `ALTERADO`, `NO_ANCLADO` o `NO_AUDITABLE`. |

> La auditoría distingue **ausencia de anclaje** de **alteración**: que un día nunca se haya notarizado no es un fraude.

---

## 📚 Documentación Adicional

- [📘 Guía Oficial de Despliegue en Sepolia](docs/GUIA_DESPLIEGUE.md): Pasos para configurar Alchemy, MetaMask y verificar el código en Etherscan.
- [📸 Manual de Usuario y Escenarios de Prueba](docs/MANUAL_DE_USUARIO.md): Documento con los 5 escenarios de demostración y espacios para capturas de pantalla.

---

## ❓ Preguntas Frecuentes

| Pregunta de la Cátedra | Respuesta Técnica Arquitectónica |
| :--- | :--- |
| **¿Por qué no guardar los medicamentos directo en Ethereum?** | Por leyes de privacidad médica (Ley 25.326 en Argentina). Los datos en Ethereum son públicos para siempre e imposibles de borrar. Almacenar patologías o fármacos violaría el derecho a la privacidad. Con *Data Anchoring*, solo viaja un hash matemático irreversible. |
| **¿Por qué `bytes32` en lugar de `string` en Solidity?** | SHA-256 produce exactamente 256 bits (32 bytes). En la EVM de Ethereum, un `bytes32` cabe en un único slot de memoria (32 bytes) y consume el mínimo posible de gas (20.000 unidades en primer guardado). Usar `string` obligaría a almacenar longitud y punteros dinámicos, aumentando drásticamente el costo de gas. |
| **¿Por qué el modificador `onlyOwner`?** | Para evitar que cualquier persona o nodo desconocido pueda inyectar hashes falsos haciéndose pasar por la aplicación MiMedicación. Solo la clave privada autorizada del backend puede firmar transacciones de guardado. |
| **¿Cómo demuestra el sistema si alguien adulteró la base de datos?** | Por el **Efecto Avalancha** de SHA-256: cambiar un solo minuto o una letra en la dosis de un medicamento cambia por completo el hash resultante. Al llamar a `auditarIntegridadRegistro()`, el hash no coincidirá con el sellado en Sepolia y el sistema alertará la manipulación. |

---

## 🛠️ Solución de Problemas Frecuentes

- **Error: `ProviderError: insufficient funds for intrinsic transaction cost`**  
  👉 Tu wallet no tiene suficiente Sepolia ETH para pagar el gas de la red. Solicita más ETH gratis en los faucets indicados en los requisitos.
- **Al correr de nuevo `npm run cron:test` el mismo día el lote reporta `SIN_CAMBIOS`**  
  👉 Es el comportamiento esperado, no un error: el contrato rechaza sobrescribir una fecha ya sellada y el cron lo informa como *ya anclado*, sin alertar de una falla. Para volver a anclar, usá otra fecha o desplegá una instancia nueva con `npm run deploy:sepolia`.
- **Error de scripts en PowerShell en Windows (`SecurityError: UnauthorizedAccess`)**  
  👉 Abre la terminal como **Command Prompt (CMD)** dentro de VS Code, o ejecuta: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`.
