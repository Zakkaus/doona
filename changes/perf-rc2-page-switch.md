Changed

- Page switches do less layout work: dashboard packing reads every card before it writes, sliders and overflow checks measure once from their observer, tag lists mount only the links that fit, and the Policies grid no longer rebuilds for an equivalent callback.
