# 🚀 Guía Oficial de Despliegue en Ethereum Sepolia Testnet

> **Proyecto:** MiMedicación  
> **Institución:** Universidad Provincial de Ezeiza (UPE)  
> **Smart Contract:** `RegistroMedicacion.sol` (Solidity 0.8.24)  
> **Herramienta de Despliegue:** Hardhat + Ethers.js v6  

---

## 📑 Índice
1. [Requisitos Previos](#1-requisitos-previos)
2. [Obtención de Credenciales y Fondos](#2-obtención-de-credenciales-y-fondos)
3. [Configuración del Archivo .env](#3-configuración-del-archivo-env)
4. [Compilación Local](#4-compilación-local)
5. [Ejecución del Despliegue a Sepolia](#5-ejecución-del-despliegue-a-sepolia)
6. [Verificación en Sepolia Etherscan](#6-verificación-en-sepolia-etherscan)
7. [Resolución de Problemas Frecuentes](#7-resolución-de-problemas-frecuentes)

---

## 1. Requisitos Previos

Asegúrate de tener instalado en tu equipo:
- **Node.js** (v18.x, v20.x o superior).
- **Git**.
- **Visual Studio Code**.
- La extensión del navegador **MetaMask**.

Verifica tus versiones en la terminal:
```bash
node -v
npm -v
git --version
```

---

## 2. Obtención de Credenciales y Fondos

Para interactuar con la red Sepolia sin costo de dinero real, necesitamos una cuenta con gas de prueba y un nodo RPC.

### A. Obtener Clave Privada de MetaMask
1. Abre tu extensión de MetaMask en el navegador.
2. Selecciona la red **Sepolia** (si no aparece, ve a *Ajustes > Avanzado > Mostrar redes de prueba*).
3. Haz clic en los tres puntos verticales al lado del nombre de tu cuenta y selecciona **Detalles de la cuenta**.
4. Haz clic en **Mostrar clave privada** e introduce tu contraseña.
5. Copia la cadena hexadecimal (ejemplo: `0x4f3...` o sin prefijo `0x`).
> ⚠️ **REGLA DE SEGURIDAD CRÍTICA:** Utiliza siempre una wallet de desarrollo/pruebas. Nunca expongas la clave privada de una billetera con fondos reales.

### B. Obtener Sepolia ETH Gratis (Faucets)
El despliegue de contratos consume gas en la red. Solicita fondos gratuitos en cualquiera de estos faucets oficiales:
- [Google Cloud Web3 Sepolia Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) *(Recomendado: entrega 0.05 Sepolia ETH al instante con cuenta de Google)*.
- [Alchemy Sepolia Faucet](https://sepoliafaucet.com/) *(Requiere login gratuito en Alchemy)*.
- [PoW Faucet Sepolia](https://sepolia-faucet.pk910.de/) *(Minado en navegador)*.

### C. Obtener API Key de Alchemy (Proveedor RPC)
1. Regístrate gratis en [Alchemy.com](https://dashboard.alchemy.com/).
2. En el panel principal, haz clic en **Create new app**.
3. Configuración:
   - **Chain:** Ethereum
   - **Network:** Sepolia
   - **Name:** MiMedicación UPE
4. Al crearse, haz clic en **API Key** y copia el valor alfanumérico.

---

## 3. Configuración del Archivo `.env`

En la raíz del proyecto, asegúrate de tener tu archivo `.env` configurado:

```bash
# Copia la plantilla si aún no lo hiciste
copy .env.example .env
```

Edita `.env` con tus credenciales:
```env
# Clave privada de MetaMask (con o sin 0x al inicio)
PRIVATE_KEY=0xTU_CLAVE_PRIVADA_OBTENIDA_EN_METAMASK

# API Key de Alchemy para Sepolia
ALCHEMY_API_KEY=tu_api_key_de_alchemy

# Dirección del contrato (inicialmente en blanco o en ceros hasta que despliegues)
CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000

# (Opcional) API Key de Etherscan si deseas verificar el código fuente públicamente
ETHERSCAN_API_KEY=
```

---

## 4. Compilación Local

Antes de gastar gas en la red pública, compila y testea los contratos localmente:

```bash
# 1. Compilar los contratos en Solidity
npm run compile

# 2. Ejecutar los tests unitarios en la EVM local de Hardhat
npm test
```

Los **122 casos** deben pasar en verde, repartidos en 7 suites:
- ✅ Contrato: owner, registro, emisión del evento `HashRegistrado`, `onlyOwner`, inmutabilidad y `verificarHash`.
- ✅ Hash diario: determinismo de la canonicalización (mismo registro, mismo hash).
- ✅ Validación de fechas y día calendario argentino, incluido el 29 de febrero.
- ✅ Auditoría en tres estados: `INTEGRO`, `ALTERADO` y `NO_ANCLADO`.
- ✅ Clasificación de errores al anclar: cada rechazo se reporta por su causa real.
- ✅ Resumen del lote diario y cierre del proceso que ejecuta el cron.

---

## 5. Ejecución del Despliegue a Sepolia

Ejecuta el script de despliegue automatizado:

```bash
npm run deploy:sepolia
```

### ¿Qué ocurre internamente durante este comando?
1. Hardhat se conecta al nodo de Alchemy en Sepolia.
2. Lee tu `PRIVATE_KEY` y firma la transacción de creación del contrato.
3. Envía el bytecode optimizado a los mineros/validadores de Sepolia.
4. Espera a que la transacción sea incluida en un bloque.
5. Guarda automáticamente la dirección resultante en `src/deployment-info.json`.

### Salida esperada en la consola:
```text
=================================================================
 🏥 PROYECTO MIMEDICACIÓN - UNIVERSIDAD PROVINCIAL DE EZEIZA (UPE)
 🚀 Despliegue del Smart Contract: RegistroMedicacion
=================================================================

📡 Red objetivo: SEPOLIA
👤 Cuenta desplegadora (Backend Owner): 0x71bE63f3384f5fb98995898A86B02Fb2426c5788
💰 Saldo de la cuenta: 0.15 ETH

📦 Obteniendo fábrica del contrato 'RegistroMedicacion'...
⏳ Enviando transacción de despliegue a la red...

=================================================================
✅ ¡Contrato desplegado con éxito!
📍 Dirección del Contrato: 0x4B3e5c98A0123456789abcdef0123456789abcde
=================================================================

🔍 Ver en Etherscan: https://sepolia.etherscan.io/address/0x4B3e5c98A0123456789abcdef0123456789abcde

💡 Para verificar el código fuente en Etherscan ejecuta:
   npx hardhat verify --network sepolia 0x4B3e5c98A0123456789abcdef0123456789abcde

📝 Archivo de configuración generado en: src/deployment-info.json
🔔 Recuerda actualizar CONTRACT_ADDRESS=0x4B3e5c98A0123456789abcdef0123456789abcde en tu archivo .env
```

### 👉 Acción Inmediata:
Copia la dirección del contrato obtenida y colócala en tu `.env`:
```env
CONTRACT_ADDRESS=0x4B3e5c98A0123456789abcdef0123456789abcde
```

---

## 6. Verificación en Sepolia Etherscan

Puedes abrir el explorador público para corroborar que el contrato está vivo:
1. Abre tu navegador y dirígete a:
   `https://sepolia.etherscan.io/address/TU_CONTRACT_ADDRESS`
2. Verás la transacción de creación (**Contract Creation**) con el estado **Success**.
3. (Opcional) Si configuraste `ETHERSCAN_API_KEY`, publica el código fuente para que aparezca el tilde verde de verificación pública:
   ```bash
   npx hardhat verify --network sepolia TU_CONTRACT_ADDRESS
   ```

---

## 7. Resolución de Problemas Frecuentes

| Error en Consola | Causa | Solución |
| :--- | :--- | :--- |
| `insufficient funds for intrinsic transaction cost` | La wallet no tiene Sepolia ETH para pagar el gas. | Solicita más fondos en los faucets indicados en el paso 2.B. |
| `invalid API key` en Alchemy | La API Key en `.env` está vacía o es incorrecta. | Verifica copiar la API Key exacta de tu app en Alchemy Dashboard. |
| `SecurityError: UnauthorizedAccess` (PowerShell) | Política restrictiva de scripts en Windows. | Abre una terminal **CMD (Command Prompt)** en VS Code o corre `npm.cmd run deploy:sepolia`. |
| `nonce too high / replacement transaction underpriced` | Transacciones pendientes en MetaMask. | En MetaMask: *Ajustes > Avanzado > Borrar datos de pestañas/actividad* para sincronizar el nonce. |
