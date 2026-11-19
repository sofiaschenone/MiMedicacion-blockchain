# ☁️ Guía de Despliegue en Vercel & Base de Datos en la Nube (100% Gratuito)

> **Proyecto:** MiMedicación — Universidad Provincial de Ezeiza (UPE)  
> **Costo total:** $0.00 USD (Sin tarjeta de crédito)  

---

## 🎯 Objetivo
Tener la aplicación **MiMedicación** accesible públicamente desde cualquier dispositivo mediante una URL de producción (ej: `https://mimedicacion.vercel.app`) y con sus datos médicos sincronizados en una base de datos en la nube real.

---

## 🍃 PASO 1: Crear tu Base de Datos en la Nube (MongoDB Atlas — Gratis de por vida)

MongoDB Atlas ofrece un clúster **M0 Sandbox** 100% gratuito sin requerir tarjeta de crédito.

1. Ingresa a **[mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register)** y crea una cuenta gratuita.
2. Al iniciar, selecciona el plan **M0 (Free)**:
   - Proveedor: AWS o Google Cloud.
   - Región: `us-east-1` (N. Virginia) o la más cercana.
   - Nombre del clúster: `Cluster0`.
   - Haz clic en **Create Deployment**.
3. **Seguridad (Usuario y Red):**
   - **Username / Password:** Define un usuario y contraseña (ej: usuario `admin_mimedicacion` y contraseña segura). *¡Recuerda anotarla!*
   - **Network Access (IP Access List):** En *IP Address*, selecciona **`Allow Access from Anywhere` (0.0.0.0/0)** para que Vercel pueda conectarse desde la nube.
4. **Obtener la Connection String (URI):**
   - Ve a **Database > Connect > Drivers (Node.js)**.
   - Copia la URL de conexión que se parece a esto:
     ```text
     mongodb+srv://admin_mimedicacion:<password>@cluster0.abcde.mongodb.net/mimedicacion?retryWrites=true&w=majority
     ```
   - Reemplaza `<password>` por tu contraseña real.

---

## ▲ PASO 2: Despliegue en Vercel (1 Clic desde GitHub)

Vercel aloja tanto el Frontend como la API Serverless de forma gratuita.

1. Ingresa a **[vercel.com](https://vercel.com/)** e inicia sesión con tu cuenta de **GitHub**.
2. Haz clic en el botón azul **"Add New..." > "Project"**.
3. Busca tu repositorio de GitHub `mimedicacion` (o el nombre que le diste) y haz clic en **"Import"**.
4. En la sección **Environment Variables (Variables de Entorno)**, despliega la pestaña y agrega las siguientes 4 variables:

| Nombre de la Variable | Valor |
| :--- | :--- |
| `PRIVATE_KEY` | Tu clave privada de MetaMask (con `0x` al inicio). |
| `ALCHEMY_API_KEY` | Tu API Key de Alchemy para Sepolia. |
| `CONTRACT_ADDRESS` | `0x8dbB5e9Fe07B30ad1c2d8FaEdd5d2FE99Cc876dF` |
| `MONGODB_URI` | La connection string obtenida en el Paso 1. |

5. Haz clic en el botón azul **"Deploy"**.
6. En menos de 45 segundos, Vercel compilará el proyecto y te entregará tu **URL pública oficial**:
   ```text
   🎉 Congratulations! Your project is live at:
   https://mimedicacion-equipo-upe.vercel.app
   ```

---

## 🌱 PASO 3: Poblar la Base de Datos Inicial (Opcional)

Si deseas cargar de inmediato los registros de Don Carlos y Doña Rosa en tu base de datos de MongoDB Atlas:
1. Agrega tu `MONGODB_URI` en tu archivo local `.env`.
2. En la terminal de VS Code corre:
   ```bash
   npm run db:seed
   ```
3. ¡Listo! Al abrir la app en Vercel verás a los pacientes cargados desde MongoDB Atlas Cloud.

---

## 🔒 Privacidad y Arquitectura Verificada
- La base de datos en la nube almacena los historiales de forma privada.
- La blockchain de Ethereum Sepolia solo recibe el **hash SHA-256** generado al presionar *"Registrar Certificación en Sepolia"*.
- Cualquier persona o profesor puede abrir el enlace público en su celular o computadora, agregar medicamentos, auditar registros y comprobar las transacciones en Etherscan en vivo.
