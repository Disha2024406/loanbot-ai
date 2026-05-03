// charts.js — Chart rendering logic (donut + income bar)

function renderDonut() {
  const ctx = document.getElementById('donutC');
  if (!ctx) return;
  if (donutChart) donutChart.destroy();
  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Approved (35K)', 'Rejected (10K)'],
      datasets: [{ data: [35000, 10000],
        backgroundColor: ['rgba(52,211,153,.7)', 'rgba(248,113,113,.7)'],
        borderColor: '#111527', borderWidth: 3, hoverOffset: 6 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'68%',
      plugins:{ legend:{ display:true, position:'bottom',
        labels:{ color:'#8b93b8', font:{size:10}, boxWidth:10, padding:10 }},
        tooltip:{ callbacks:{ label: c => ` ${c.label}: ${((c.raw/45000)*100).toFixed(1)}%` }}}
    }
  });
}

function renderIncomeChart() {
  const ctx = document.getElementById('incomeC');
  if (!ctx) return;
  if (incomeChart) incomeChart.destroy();
  const labs = Object.keys(DS.incomeImpact);
  const vals = Object.values(DS.incomeImpact);
  incomeChart = new Chart(ctx, {
    type:'bar',
    data:{ labels:labs, datasets:[{ label:'Approval %', data:vals,
      backgroundColor: vals.map(v => v>80?'rgba(52,211,153,.7)':v>60?'rgba(77,124,254,.7)':'rgba(248,113,113,.7)'),
      borderRadius:5, borderSkipped:false }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: c=>`Approval: ${c.raw}%` }}},
      scales:{
        x:{ ticks:{color:'#4a5280', font:{size:9}}, grid:{color:'rgba(255,255,255,0.04)'} },
        y:{ ticks:{color:'#4a5280', font:{size:9}, callback:v=>v+'%'}, grid:{color:'rgba(255,255,255,0.04)'}, min:0, max:100 }
      }
    }
  });
}