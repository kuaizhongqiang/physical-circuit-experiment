//! 等势点合并（并查集）与**稳定编号**。算法见 `docs/solver.md` §3。

use std::collections::BTreeMap;

pub struct Dsu {
    parent: Vec<u32>,
    rank: Vec<u8>,
}

impl Dsu {
    pub fn new(n: usize) -> Self {
        Dsu {
            parent: (0..n as u32).collect(),
            rank: vec![0; n],
        }
    }
    pub fn find(&mut self, mut x: u32) -> u32 {
        while self.parent[x as usize] != x {
            let p = self.parent[x as usize];
            let gp = self.parent[p as usize];
            self.parent[x as usize] = gp;
            x = gp;
        }
        x
    }
    pub fn union(&mut self, a: u32, b: u32) {
        let (ra, rb) = (self.find(a), self.find(b));
        if ra == rb {
            return;
        }
        let (hi, lo) = if self.rank[ra as usize] < self.rank[rb as usize] {
            (rb, ra)
        } else {
            (ra, rb)
        };
        self.parent[lo as usize] = hi;
        if self.rank[hi as usize] == self.rank[lo as usize] {
            self.rank[hi as usize] += 1;
        }
    }
}

/// 合并后按"组内最小接点 id"重排，得到 0..m-1 的稳定等势点编号。
///
/// 返回 `(每个接点的等势点编号, 等势点数)`。确定性要求见 `AGENT.md` §2。
pub fn build_nodes(total_terminals: usize, dsu: &mut Dsu) -> (Vec<u32>, usize) {
    let mut roots = Vec::with_capacity(total_terminals);
    for t in 0..total_terminals as u32 {
        roots.push(dsu.find(t));
    }

    // root → 组内最小接点 id
    let mut min_of: BTreeMap<u32, u32> = BTreeMap::new();
    for (t, r) in roots.iter().enumerate() {
        let t = t as u32;
        match min_of.get_mut(r) {
            Some(m) => {
                if t < *m {
                    *m = t;
                }
            }
            None => {
                min_of.insert(*r, t);
            }
        }
    }

    // 按最小接点 id 升序编号
    let mut pairs: Vec<(u32, u32)> = min_of.iter().map(|(r, m)| (*m, *r)).collect();
    pairs.sort_unstable();
    let mut node_of_root: BTreeMap<u32, u32> = BTreeMap::new();
    for (i, (_, r)) in pairs.iter().enumerate() {
        node_of_root.insert(*r, i as u32);
    }

    let nodes = roots
        .iter()
        .map(|r| *node_of_root.get(r).expect("root 必在表内"))
        .collect();
    (nodes, pairs.len())
}
