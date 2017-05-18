// ideal case, this module should be use as data source just like mysql and redis
// TODO: subscribe to a characteristic
const
ERR_INVALID='invalid ble action'

var
noble=require('noble'),
args= require('pico-args'),
poweredOn=false,
serviceMap={},
characteristicMap={},
characteristicList=[],
dummyCB=()=>{},
getChar=function(sUUID, cUUID, index, cb){
    for(let i=index,c; c=characteristicList[i]; i++){
        if (c._serviceUuid===sUUID && c.uuid===cUUID) break
    }
    cb(null, c, ()=>{
        getChar(sUUID, cUUID, i, cb)
    })
},
getChars=function(service, characteristic, cb){
    var
    sUUID=serviceMap[service],
    cUUID=characteristicMap[characteristic]

    if (!sUUID) return cb(`invalid service: ${service}`)
    if (!cUUID) return cb(`invalid characteristic: ${characteristic}`)

    getChar(sUUID, cUUID, 0, cb)
},
start=function(services, characteristics, allowDuplicates, cb){
    serviceMap = services||serviceMap
    characteristicMap=characteristics||characteristicMap

    characteristicList=[]

    var
    keys=Object.keys(serviceMap),
    uuids=[]
    for(let i=0,id; id=services[keys[i]]; i++){
        uuids.push(id)
    }

    noble.startScanning(uuids, allowDuplicates, cb)
},
bleCtr={
    start(){
        start(...arguments)
    },
    stop(){
        noble.stopScanning()
    },
    read(service, characteristic, cb){
        var results=[]
        getChar(service, characteristic, (err, c, next)=>{
            if (!c) return cb(err, results)
            c.read((err,data)=>{
                if (err) return cb(err)
                results.push(data)
                next()
            })
        })
    },
    write(service, characteristic, data, withoutResponse, notify, cb){
        var results=[]
        getChar(service, characteristic, (err, c, next)=>{
            if (!c) return cb(err, results)
            if (notify){
                c.on('data', (ret, isNotification)=>{
                    results.push(ret)
                    next()
                })
            }
            if (withoutResponse){
                c.write(data, withoutResponse)
                if (!notify) return next()
            }
            c.write(data, withoutResponse, (err)=>{
                if (err) return cb(err)
                next()
            })
        })
    }
}

module.exports= {
    create(appConfig, libConfig, next){
        config={
            services:{},
            characteristics:{}
        }

        args.print('BLE_CTR Options',Object.assign(config,libConfig))

        noble.on('stateChange',(state)=>{
            console.log(`BLE_CTR state ${state} at ${Date.now()}`)
            switch(state){
            case 'poweredOn':
                poweredOn=on
                start(config.services, config.characteristics, false, next)
                break
            case 'unknown':
            case 'unsupported':
            case 'unauthorized':
            case 'resetting':
            case 'poweredOff':
                poweredOn=false
                noble.stopScanning()
                break
            }
        })
        noble.on('discover', (peripheral)=>{
            peripheral.discoverAllServicesAndCharacteristics((err, services, characteristics)=>{
                characteristicList.push(...characteristics)
            })
        })
    }
}
