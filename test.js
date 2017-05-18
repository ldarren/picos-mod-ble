const
pico=require('pico-common/pico-cli'),
ensure= pico.export('pico/test').ensure,
central=require('./central'),
peripheral=require('./peripheral')

let
centralCli, peripheralCli

ensure('ensure central loaded', function(cb){
	cb(null, !!central)
})
ensure('ensure peripheral loaded', function(cb){
	cb(null, !!peripheral)
})
ensure('ensure central create', function(cb){
	central.create({path:'',env:'pro'},{},(err, cli)=>{
		if (err) return cb(err)
		centralCli=cli
		cb(null, !!centralCli)
	})
})
ensure('ensure peripheral create', function(cb){
	peripheral.create({path:'',env:'pro'},{},(err, cli)=>{
		if (err) return cb(err)
		peripheralCli=cli
		cb(null, !!peripheralCli)
	})
})
