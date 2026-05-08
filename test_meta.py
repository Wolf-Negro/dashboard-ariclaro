import os
import requests
import json
import calendar
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

ACCESS_TOKEN = os.environ.get('META_ACCESS_TOKEN')
AD_ACCOUNT_ID = os.environ.get('AD_ACCOUNT_ID_2')

def test_meta_leads_comparison(month_str):
    year, month_num = map(int, month_str.split('-'))
    ultimo_dia = calendar.monthrange(year, month_num)[1]
    since_date = f"{year}-{month_num:02d}-01"
    until_date = f"{year}-{month_num:02d}-{ultimo_dia}"
    
    url = f"https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/insights"
    params = {
        'access_token': ACCESS_TOKEN,
        'level': 'account',
        'fields': 'spend,date_start,actions',
        'time_increment': 1,
        'time_range': json.dumps({"since": since_date, "until": until_date}),
        'limit': '1000'
    }
    
    print(f"--- Comparison: {month_str} | Account: {AD_ACCOUNT_ID} ---")
    res = requests.get(url, params=params).json()
    data = res.get('data', [])
    
    for day in data:
        actions = day.get('actions', [])
        lead_val = next((int(a['value']) for a in actions if a['action_type'] == 'lead'), 0)
        pixel_lead_val = next((int(a['value']) for a in actions if a['action_type'] == 'offsite_conversion.fb_pixel_lead'), 0)
        
        if lead_val != pixel_lead_val:
            print(f"Mismatch on {day['date_start']}: lead={lead_val}, pixel_lead={pixel_lead_val}")
        elif lead_val > 0:
            print(f"Match on {day['date_start']}: {lead_val}")

if __name__ == "__main__":
    from datetime import datetime
    current_month = datetime.now().strftime('%Y-%m')
    # Test for both accounts
    for acc in [os.environ.get('AD_ACCOUNT_ID_1'), os.environ.get('AD_ACCOUNT_ID_2')]:
        AD_ACCOUNT_ID = acc
        test_meta_leads_comparison(current_month)
