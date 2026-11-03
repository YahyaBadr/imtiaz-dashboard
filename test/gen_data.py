import csv, random, os
random.seed(42)
os.makedirs('test/data', exist_ok=True)

# students: 566 total, group_id 1..20
with open('test/data/01_students.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f); w.writerow(['student_code','full_name','gender','group_id','phone','nid','birth_date','reg_date','student_notes'])
    for i in range(566):
        g=(i%20)+1; gender='F' if i%4 else 'M'
        w.writerow([f'202{i:05d}', f'طالب {i+1}', gender, g, f'01{random.randint(10000000,99999999)}', f'29{i:015d}', '2004-05-15','2026-09-01',''])

# groups: 20
with open('test/data/02_groups.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f); w.writerow(['group_id','group_name','total_students','females','males','unknown_gender','category'])
    for g in range(1,21):
        tot=28 if g==1 else 27+(g%2); fm=tot//2; ml=tot-fm
        w.writerow([g, f'جروب {g}', tot, fm, ml, 0, 'ممتاز' if g<=5 else 'جيد'])

# rounds overview
with open('test/data/03_rounds_overview.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f); w.writerow(['round_order','round_key','round_name_ar','start_date','end_date','status'])
    for r in range(1,5):
        w.writerow([r, f'R{r}', f'الدورة {r}', f'2026-{r:02d}-01', f'2026-{r+2:02d}-01', 'قادم'])

# round schedule: each group x 4 rounds -> dept etc.
DEPTS=['القوى العاملة','الأمصال واللقاحات','التناسليات','الجراحة','التوليد','الطفيليات','الباطنة','الأشعة','الفورمنز','سلامة الغذاء']
with open('test/data/04_round_schedule.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f); w.writerow(['group_id','round_order','round_key','department','partner_group','actual_students','declared_total','start_date','end_date'])
    for g in range(1,21):
        for r in range(1,5):
            d=DEPTS[(g+r)%len(DEPTS)]
            w.writerow([g,r,f'R{r}',d,'',(28 if g==1 else 27), (28 if g==1 else 27), f'2026-{r:02d}-01', f'2026-{r+2:02d}-01'])

# units draft
UNITS=[('مجازر قليوب','القليوبية'),('مجازر شبرا الخيمة','القليوبية'),('دواجن الخانكة','القليوبية'),('وحدة الوبائية','القاهرة'),('معامل المرجعية','الجيزة'),('بنك الدم','القاهرة'),('الرعاية التناسلية','القليوبية'),('الحملة القومية','القاهرة'),('سلامة الغذاء','الجيزة'),('التفتيش البيطري','القليوبية'),('إبادة الحيوانات','الجيزة'),('وحدات بيطرية','القليوبية')]
with open('test/data/05_stations_units_draft.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f); w.writerow(['unit_name','governorate','female_teachers','male_teachers','total_teachers','capacity','enrolled','field'])
    for i,(u,gov) in enumerate(UNITS):
        w.writerow([u,gov, 3+i%4, 2+i%3, 5+ (i%4)+(i%3), 30, 20+i*2, DEPTS[i%len(DEPTS)]])

# assignments R2
with open('test/data/06_assignments_round2.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f); w.writerow(['group_id','round_order','field_name','pref_1','pref_2','pref_3'])
    for g in range(1,21):
        w.writerow([g,2,DEPTS[g%len(DEPTS)],DEPTS[g%len(DEPTS)],DEPTS[(g+1)%len(DEPTS)],DEPTS[(g+2)%len(DEPTS)]])

# unregistered: 11
with open('test/data/07_unregistered_round2.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f); w.writerow(['student_code','full_name','group_id','gender'])
    for i in range(11):
        w.writerow([f'2029{i:04d}', f'غير مسجل {i+1}', (i%20)+1, 'F' if i%2 else 'M'])

# round2 summary
with open('test/data/08_round2_summary.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f); w.writerow(['metric','value'])
    w.writerow(['total_students',566]); w.writerow(['registered',555]); w.writerow(['not_registered',11])

# round dates
with open('test/data/09_round_dates.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f); w.writerow(['round_order','round_key','start_date','end_date'])
    for r in range(1,5):
        w.writerow([r,f'R{r}',f'2026-{r:02d}-01',f'2026-{r+2:02d}-01'])

# fields
with open('test/data/10_fields.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f); w.writerow(['field_name','capacity','section','color_tone'])
    for i,d in enumerate(DEPTS):
        w.writerow([d, 28+i, 'أقسام' if i<5 else 'اختياري', ''])

print('data ok:', sorted(os.listdir('test/data')))
