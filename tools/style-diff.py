# Compares two style-snapshot.mjs outputs; the memory bar width is mock noise and is ignored.
import json,sys
a=json.load(open(sys.argv[1])); b=json.load(open(sys.argv[2]))
noise=lambda r: r.split('|')[0].endswith('div.track>div.fill')
bad=0
for k in a:
    ra={r for r in a[k]['rows'] if not noise(r)}; rb={r for r in b[k]['rows'] if not noise(r)}
    if ra!=rb:
        bad+=1
        if bad<=12:
            print(k,'only-before',len(ra-rb),'only-after',len(rb-ra))
            for r in sorted(ra-rb)[:2]: print('   before:',r[:200])
            for r in sorted(rb-ra)[:2]: print('   after: ',r[:200])
print('differing snapshots:',bad,'of',len(a))
