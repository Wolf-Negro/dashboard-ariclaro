import os
from flask import Flask, render_template, jsonify, request
import requests
from datetime import datetime
import pytz
import calendar
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

app = Flask(__name__)

# Configuración de Meta Ads
ACCESS_TOKEN = os.environ.get('META_ACCESS_TOKEN')
# Soporte para múltiples cuentas
AD_ACCOUNT_IDS = [
    os.environ.get('AD_ACCOUNT_ID_1'),
    os.environ.get('AD_ACCOUNT_ID_2')
]
# Limpiar nulos o vacíos
AD_ACCOUNT_IDS = [acc for acc in AD_ACCOUNT_IDS if acc]

MONTHLY_BUDGET = float(os.environ.get('MONTHLY_BUDGET', 12000))
CLIENT_NAME = os.environ.get('CLIENT_NAME', 'ARI CLARO')
CURRENCY = os.environ.get('CURRENCY', 'PEN')

PERU_TZ = pytz.timezone('America/Lima')

def get_peru_now():
    """Retorna datetime actual en America/Lima."""
    return datetime.now(PERU_TZ)

def process_meta_data(data):
    """Procesa insights de Meta y devuelve un array formateado (newest first)."""
    processed = []
    # Agrupar por fecha ya que podemos tener múltiples cuentas
    by_date = {}
    
    for day_entry in data:
        date_str = day_entry.get('date_start')
        spend = float(day_entry.get('spend', 0.0))
        leads = 0
        actions = day_entry.get('actions', [])
        for action in actions:
            # Capturar solo la métrica principal de "lead" (Clientes potenciales)
            # Se eliminan los otros tipos para evitar duplicidad según auditoría de data
            if action['action_type'] == 'lead':
                leads += int(action['value'])
        
        ctr = float(day_entry.get('unique_inline_link_click_ctr', day_entry.get('inline_link_click_ctr', 0.0)))
        
        if date_str not in by_date:
            by_date[date_str] = {
                "spend": 0.0,
                "leads": 0,
                "ctr_sum": 0.0,
                "ctr_count": 0
            }
        
        by_date[date_str]["spend"] += spend
        by_date[date_str]["leads"] += leads
        by_date[date_str]["ctr_sum"] += ctr
        by_date[date_str]["ctr_count"] += 1

    # Convertir a lista y formatear
    for date_str, values in by_date.items():
        dt_obj = datetime.strptime(date_str, '%Y-%m-%d')
        display_date = dt_obj.strftime('%d %b')
        
        spend = values["spend"]
        leads = values["leads"]
        avg_ctr = values["ctr_sum"] / values["ctr_count"] if values["ctr_count"] > 0 else 0.0
        
        processed.append({
            "date": display_date,
            "date_raw": date_str,
            "spend": spend,
            "leads": leads,
            "cpl": round(spend / leads, 2) if leads > 0 else 0.0,
            "ctr": round(avg_ctr, 2)
        })
    
    # Ordenar por fecha antes de devolver
    processed.sort(key=lambda x: x['date_raw'])
    return processed

@app.route('/')
def index():
    return render_template('index.html', client_name=CLIENT_NAME)

@app.route('/api/data')
def get_data():
    month = request.args.get('month')
    now = get_peru_now()
    today_str = now.strftime('%Y-%m-%d')
    
    if not month:
        month = today_str[:7]
    
    try:
        year, month_num = map(int, month.split('-'))
        ultimo_dia = calendar.monthrange(year, month_num)[1]
        since_date = f"{year}-{month_num:02d}-01"
        until_date = f"{year}-{month_num:02d}-{ultimo_dia}"
    except:
        now = get_peru_now()
        since_date = now.strftime('%Y-%m-01')
        until_date = now.strftime('%Y-%m-31')
        ultimo_dia = 30

    import json
    all_raw_data = []
    
    for account_id in AD_ACCOUNT_IDS:
        url = f"https://graph.facebook.com/v19.0/{account_id}/insights"
        params = {
            'access_token': ACCESS_TOKEN,
            'level': 'account',
            'fields': 'spend,actions,unique_inline_link_click_ctr,inline_link_click_ctr,date_start',
            'time_increment': 1,
            'time_range': json.dumps({"since": since_date, "until": until_date}),
            'limit': '1000'
        }
        try:
            response = requests.get(url, params=params, timeout=15)
            response.raise_for_status()
            res_json = response.json()
            all_raw_data.extend(res_json.get('data', []))
        except Exception as e:
            print(f"Error fetching data for {account_id}: {e}")

    try:
        # Filtro de seguridad por mes
        filtered_raw = [d for d in all_raw_data if d.get('date_start', '').startswith(month)]
        processed_data = process_meta_data(filtered_raw)

        # SIEMPRE Invertir: Lo más reciente primero para la tabla
        display_data = list(reversed(processed_data))

        total_spend = sum(d['spend'] for d in processed_data)
        total_leads = sum(d['leads'] for d in processed_data)
        avg_cpl = round(total_spend / total_leads, 2) if total_leads > 0 else 0
        
        presupuesto_total = MONTHLY_BUDGET
        presupuesto_consumido = round(total_spend, 2)
        presupuesto_restante = round(max(0, presupuesto_total - presupuesto_consumido), 2)

        return jsonify({
            "status": "success",
            "kpis": {
                "gastoTotal": f"S/. {presupuesto_consumido:,.2f}",
                "leadsTotales": total_leads,
                "costoPorLeadPromedio": f"S/. {avg_cpl:.2f}",
                "presupuestoConsumido": presupuesto_consumido,
                "presupuestoRestante": presupuesto_restante
            },
            "charts": {
                "line": {
                    "labels": [d["date"] for d in processed_data],
                    "data": [d["cpl"] for d in processed_data]
                },
                "mixed": {
                    "labels": [d["date"] for d in processed_data],
                    "spend": [d["spend"] for d in processed_data],
                    "leads": [d["leads"] for d in processed_data]
                },
                "doughnut": {
                    "labels": ["Consumido", "Restante"],
                    "data": [presupuesto_consumido, presupuesto_restante]
                }
            },
            "dailyMetrics": display_data,
            "monthDays": ultimo_dia
        })

    except Exception as e:
        return jsonify({"status": "error", "message": f"Sync Error: {str(e)}"})

@app.route('/api/today')
def get_today():
    now = get_peru_now()
    hoy_ptr = now.strftime('%Y-%m-%d')
    
    import json
    all_raw_data = []
    
    for account_id in AD_ACCOUNT_IDS:
        url = f"https://graph.facebook.com/v19.0/{account_id}/insights"
        params = {
            'access_token': ACCESS_TOKEN,
            'level': 'account',
            'fields': 'spend,actions,unique_inline_link_click_ctr,inline_link_click_ctr,date_start',
            'time_range': json.dumps({"since": hoy_ptr, "until": hoy_ptr}),
        }
        try:
            response = requests.get(url, params=params, timeout=10)
            all_raw_data.extend(response.json().get('data', []))
        except Exception:
            pass

    try:
        if not all_raw_data:
            return jsonify({
                "status": "success",
                "data": {
                    "date": now.strftime('%d %b'),
                    "date_raw": now.strftime('%Y-%m-%d'),
                    "spend": 0.0,
                    "leads": 0,
                    "cpl": 0.0,
                    "ctr": 0.0
                }
            })
            
        processed = process_meta_data(all_raw_data)
        return jsonify({"status": "success", "data": processed[0]})
    except Exception:
        return jsonify({"status": "error"})

if __name__ == '__main__':
    app.run(debug=True)
