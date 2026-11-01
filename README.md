# FAN - Sistema de Punto de Venta (POS) & Trazabilidad por Lotes FEFO

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI_0.115+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![React Native](https://img.shields.io/badge/Frontend-React_Native_/_Expo_51-61DAFB?style=flat&logo=react&logoColor=black)](https://reactnative.dev/)
[![MySQL](https://img.shields.io/badge/Database-MySQL_8+_/_MariaDB-4479A1?style=flat&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**FAN** es un sistema moderno, ultraligero y de alto rendimiento de **Punto de Venta (POS)** y control de inventarios diseñado para operar de forma fluida en múltiples interfaces: **Móvil (Android/iOS), Tablets, Web y Escritorio**. 

Su arquitectura desacoplada combina la velocidad asíncrona de **FastAPI** en Python con la ligereza y confiabilidad de **MySQL**, asegurando transacciones atómicas con bloqueo pesimista y cumplimiento estricto de rotación de mercadería **FEFO (First Expired, First Out)**.

---

## 🚀 Ventajas y Rendimiento

- **Backend Ultrarrápido y Asíncrono:** Construido con Python y FastAPI sobre SQLAlchemy 2.0 Async + `aiomysql`. Maneja cientos de peticiones por segundo con tiempos de respuesta en milisegundos.
- **Ligereza y Escalabilidad con MySQL:** Estructura relacional optimizada con índices deterministas y compatibilidad universal con entornos locales (XAMPP, Docker) y servidores en la nube.
- **Frontend Multiplataforma React Native:** Una sola base de código en TypeScript estricto optimizada para dispositivos táctiles de gama media/baja con `FlatList` virtualizado a 60 FPS estables.
- **Trazabilidad FEFO Transaccional (ACID):** Evita mermas garantizando que el sistema descuente automáticamente los lotes más próximos a caducar mediante bloqueos pesimistas `SELECT ... FOR UPDATE`.

---

## 📦 Módulos del Sistema

### 1. 🛒 Módulo POS / Venta Rápida
- **Escaneo Inteligente:** Soporte para cámara integrada (`expo-camera`) y lectores de código de barra físicos USB/Bluetooth (EAN-13, QR, Code128, UPC).
- **Buscador con Debounce:** Filtrado instantáneo por nombre, SKU o código de barra con retraso controlado de 300 ms.
- **Carrito Táctil con Límite de Stock:** Impide visual y lógicamente agregar más existencias de las disponibles en la sucursal.
- **Cobro Multi-Método (Split Payments):** Soporta pagos combinados en una sola venta (Efectivo, Yape, Plin, Tarjeta / POS, Transferencia) con cálculo automático de vuelto en tiempo real.

### 2. 📦 Módulo de Inventario & Control de Lotes
- **Alta Rápida de Stock:** Creación al vuelo de nuevos productos y asignación automática de número de lote `LOT-{YYYYMMDD}-{código}`.
- **Herencia de Precios:** Autocompletado de precios de compra y venta basados en el último lote recibido.
- **Ajustes y Mermas:** Registro de bajas definitivas por caducidad o merma física con rastro de auditoría.

### 3. ⚠️ Motor de Alertas Preventivas
- **Evaluación Automatizada:** Tareas en segundo plano con `APScheduler` y disparadores post-venta.
- **Categorización por Severidad:**
  - 🔴 **Crítico (Rojo):** Lotes vencidos que aún mantienen saldo en estantería.
  - 🟠 **Medio (Ámbar):** Lotes por vencer en 15 días o menos.
  - 🟡 **Bajo (Amarillo):** Quiebre de inventario por debajo del stock mínimo configurado.
- **Acción Inmediata:** Botón de un toque para dar de baja por merma directamente desde la tarjeta de alerta.

### 4. 📊 Módulo de Informes y Cierre de Caja `[BETA]`
> ⚠️ **Estado:** En fase de pruebas activas.
- **Arqueo de Efectivo:** Estimación del efectivo neto esperado en caja (descontando vueltos entregados).
- **Margen de Ganancia Bruto:** Cálculo de rentabilidad real: $\sum (\text{precio\_venta} - \text{costo\_real\_lote}) \times \text{cantidad}$.
- **Desglose de Ingresos:** Comparativa de transacciones recaudadas por cada método de pago.
- **Trazabilidad de Comprobantes:** Relación de boletas y facturas con anulación transaccional (reversión de inventario a los lotes de origen).

### 5. 🔐 Autenticación y Seguridad
- Sesiones seguras mediante **JWT (Bearer token)** con algoritmo HS256.
- Control de acceso basado en roles (**ADMIN**, **SUPERVISOR**, **CASHIER**).
- Soporte para operación aislada por sucursal.

---

## 📂 Estructura del Repositorio

```
FAN/
├── backend/                  # API REST en Python / FastAPI
│   ├── app/
│   │   ├── api/              # Endpoints v1 (auth, products, batches, sales, alerts, reports)
│   │   ├── core/             # Configuración (.env), seguridad JWT, errores RFC 7807 y reloj
│   │   ├── db/               # Sesión asíncrona SQLAlchemy (aiomysql)
│   │   ├── models/           # Mapeo ORM relacional MySQL
│   │   ├── repositories/     # Consultas desacopladas y bloqueos pesimistas
│   │   ├── schemas/          # Schemas Pydantic v2 (validación estricta in/out)
│   │   ├── services/         # Lógica FEFO, arqueo de caja y motor de alertas
│   │   └── main.py           # Instancia FastAPI y ciclo de vida (lifespan)
│   ├── database_mysql.sql    # Script DDL + datos semilla para MySQL / XAMPP
│   ├── requirements.txt      # Dependencias de Python
│   └── .env.example          # Plantilla de variables de entorno
│
└── frontend/                 # Aplicación Móvil / Web en React Native (Expo SDK 51)
    ├── src/
    │   ├── api/              # Cliente Axios con interceptores JWT
    │   ├── components/       # Escáner modal, teclado numérico, fila de carrito, banners
    │   ├── navigation/       # AppNavigator y TabNavigator
    │   ├── screens/          # Vistas (POS, Inventario, Alertas, Informes [BETA], Login)
    │   ├── store/            # Estados Zustand (useCartStore, useAuthStore, useUIStore)
    │   ├── types/            # Tipos e interfaces TypeScript sin 'any'
    │   └── utils/            # Formateadores de moneda S/ y extractor de errores
    ├── App.tsx               # Punto de entrada con QueryClient y SafeArea
    └── package.json          # Dependencias de React Native / Expo
```

---

## 🛠️ Puesta en Marcha Rápida

### 1. Base de Datos (MySQL)
1. Inicia **MySQL** en tu servidor local (ej. XAMPP en el puerto `3306`).
2. Importa el archivo `backend/database_mysql.sql` en MySQL Workbench o phpMyAdmin. Se creará la base de datos `lotepos` con productos y lotes de prueba.

### 2. Backend (FastAPI)
```bash
cd backend
python -m venv venv
# Activar entorno (Windows: .\venv\Scripts\activate | Linux/Mac: source venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
- Documentación Swagger interactiva: `http://localhost:8000/docs`

### 3. Frontend (React Native / Expo)
```bash
cd frontend
npm install
npx expo start
```
- Presiona `a` para emulador Android, `w` para versión Web, o escanea el código QR desde **Expo Go** en tu teléfono.

---

## 👥 Credenciales de Prueba por Defecto
- **Administrador:** `admin` / `admin123`
- **Cajero:** `cajero1` / `cajero123`

---

## 📄 Licencia
Este proyecto se encuentra bajo la Licencia [MIT](LICENSE).
