/* Twenty-two children, because eight never showed the real problem:
   a design that is lovely at eight and unusable at eighty. */
window.MZDEMO = (function () {
  var N = [["Aarthi","Piano"],["Bharath","Guitar"],["Chitra","Violin"],["Deepak","Drums"],
    ["Eshwari","Vocals"],["Farhan","Keyboard"],["Gowri","Ukulele"],["Hari","Piano"],
    ["Ilango","Violin"],["Janani","Piano"],["Karthik","Guitar"],["Lakshmi","Vocals"],
    ["Mani","Drums"],["Nithya","Keyboard"],["Oviya","Violin"],["Prakash","Guitar"],
    ["Ramya","Piano"],["Sanjay","Ukulele"],["Tara","Vocals"],["Udhay","Drums"],
    ["Vidya","Violin"],["Yazhini","Piano"]];
  var marks = [1,0,1,2,1,0,1,0,1,1,0,1,2,0,1,1,1,0,1,0,1,1];
  /* Days past the due date. 0 means settled. These are the only
     numbers a dues screen needs — how late, and for how many months.
     Nothing here computes a fee; resolve_fee() does that in Postgres. */
  var late   = [0,3,0,0,17,0,1,0,0,9,0,0,24,0,0,0,6,0,0,12,0,0];
  var months = [0,1,0,0,2, 0,1,0,0,1,0,0,3, 0,0,0,1,0,0,1, 0,0];
  var rate = { Piano: 2500, Vocals: 1500, Violin: 1500, Guitar: 1500,
               Ukulele: 1500, Keyboard: 1500, Drums: 1500 };

  /* 1 Aug 2026 is a Saturday. Saturdays run 10-8, Sundays are closed. */
  var DAYS = (function () {
    var out = [], names = ["Su","Mo","Tu","We","Th","Fr","Sa"];
    for (var d = 1; d <= 31; d++) {
      var w = (5 + d) % 7;                     /* 1 Aug -> 6 = Sa */
      out.push({ d: d, w: names[w], open: w !== 0 });
    }
    return out;
  })();

  function mkMonth(i) {
    var m = {}, seed = i * 7 + 3;
    DAYS.forEach(function (day, k) {
      if (!day.open || day.d > 20) return;     /* today is the 20th */
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      var r = (seed >> 16) % 100;
      m[day.d] = r < 78 ? "present" : r < 92 ? "absent" : null;
    });
    return m;
  }
  return {
    day: "Thursday 20 August",
    days: DAYS,
    students: N.map(function (n, i) {
      return { name: n[0], inst: n[1],
               mark: marks[i]===1?"present":marks[i]===2?"absent":null,
               at: 3 + (i % 10) * 0.5,     /* 3pm → 8pm */
               late: late[i], months: months[i],
               due: months[i] * rate[n[1]],
               /* August, weekdays only. Deterministic — a prototype that
                  reshuffles on every reload cannot be judged twice. */
               month: mkMonth(i) };
    })
  };
})();
