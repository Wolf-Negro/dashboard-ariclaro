# Dashboard ARI CLARO | Alucinando Agency

Dashboard de resultados en tiempo real para **ARI CLARO**, desarrollado por **Alucinando Marketing**.

## Características
- Integración directa con Meta Ads Graph API a **nivel de campaña** (spend, alcance, clics, visitas).
- Separación automática de campañas de **Mensajes** (objetivo `OUTCOME_ENGAGEMENT`/`MESSAGES`) vs **Leads** (objetivo `OUTCOME_LEADS`/`LEAD_GENERATION`), leyendo el `objective` real de cada campaña vía la API — el gasto de un tipo nunca se mezcla con el del otro.
- Integración con GoHighLevel (GHL) para contar mensajes/oportunidades de un pipeline y stage específicos (usado como el conteo de "Mensajes").
- Selector de rango de fechas (Hoy, Ayer, Últimos 7/14/30 días, Este mes, Mes anterior, o rango personalizado) que filtra Meta y GHL de forma consistente.
- Dashboard de Mensajes: gasto de campañas de Mensajes + conteo de GHL → Costo/Msg.
- Sección de Leads: gasto de campañas de Leads + leads nativos de Meta (`action_type=lead`) → Costo/Lead.
- Análisis multicuenta (cualquier cantidad de Ad Accounts de Meta).
- Seguimiento de presupuesto mensual (PEN) para el dashboard de Mensajes.
- Gráficos interactivos con tendencias y comparativas.

## Requisitos
- Python 3.8+
- Token de acceso a la API de Meta Ads con permisos `ads_read` sobre las cuentas configuradas.
- API Key (Private Integration Token) de GoHighLevel con acceso a `opportunities`.

## Instalación
1. Clonar el repositorio:
   ```bash
   git clone https://github.com/Wolf-Negro/dashboard-ariclaro.git
   ```
2. Instalar dependencias:
   ```bash
   pip install -r requirements.txt
   ```
3. Configurar variables de entorno:
   Copiar `.env.example` a `.env` y completar los valores de Meta Ads y GHL (`GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_PIPELINE_ID`, `GHL_STAGE_ID`).
   `AD_ACCOUNT_IDS` acepta cualquier cantidad de cuentas separadas por coma (`act_111,act_222,act_333`); también acepta los IDs sin el prefijo `act_`.

### Nota sobre GHL
La API de oportunidades de GHL no soporta filtro por fecha, así que el backend pagina **todo** el pipeline/stage configurado (vía `meta.nextPageUrl`) y filtra en código por `createdAt`, convertido a hora de Lima (UTC-5 fijo). Con pipelines grandes esto implica varias llamadas secuenciales por cada carga del dashboard.

### Nota sobre la separación Mensajes/Leads
El backend llama a `/{ad_account}/campaigns?fields=objective` para cada cuenta y clasifica cada campaña antes de sumar su gasto. Campañas con un objetivo distinto a los mapeados (ej. `OUTCOME_SALES`, `CONVERSIONS`) quedan fuera de ambos totales — no se cuentan ni como Mensajes ni como Leads. Si Meta agrega nuevas nomenclaturas de objetivo, hay que sumarlas a `MENSAJES_OBJECTIVES` / `LEADS_OBJECTIVES` en `app.py`.

## Ejecución
```bash
python app.py
```

## Créditos
Desarrollado para **ARI CLARO** por **Alucinando Marketing**.
