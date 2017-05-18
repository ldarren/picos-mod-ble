//
// handle (ble serial for arduino?) is not supported.
// descriptor read and write is not supported, as cordova-ble-central is not supported it yet,
// Read and write descriptors for a particular characteristic. One of the most common descriptors used is the Client Characteristic Configuration Descriptor. This allows the client to set the notifications to indicate or notify for a particular characteristic.
//
const
SESSION_TYPE='ble',
ERR_INVALID='invalid ble action',
ERR_OFF='ble power not on',
ERR_NO_SERVICE='no ble service',

util=require('util'),
bleno=require('bleno'),
args= require('pico-args'),
Session= require('picos-session'),
dummyCB=()=>{},
Characteristic=function(name, options){
    var
    descs=options.descriptors,
    descriptors=[]

    for(let i=0,d; d=descs[i]; i++){ descriptors.push(new bleno.Descriptor(d)) }

    bleno.Characteristic.call(this, {
        uuid: options.uuid,
        properties: options.properties,
        secure: options.secure,
        descriptors: descriptors
    })

    this.name=name
},
start=function(name, spec, cb){
    cb = cb || dummyCB
    if (!spec.length) return cb()

    var
    services=[],
    characteristics=[],
    i,s,sn,chars,
    j,c

    for(i=0; s=services[i]; i++){
        sn=s.name
        chars=s.characteristics
        for(j=0; c=chars[j]; j++){
            characteristics.push(new Characteristics([name,sn,c.name].join('/'), c))
        }
        services.push(new bleno.PrimaryService(s.uuid, characteristics))
    }

    device.services=services

    bleno.startAdvertising(name, services, (err)=>{
        cb(err, ble)
    })
},
error=function(err, character, cb, next){
    switch(err[0]){
    case 400: cb(character.RESULT_ATTR_NOT_LONG); break // attempt to write data with offset, but expected data is small
    case 404: cb(character.RESULT_INVALID_OFFSET); break // read data with offset bigger than data size
    case 415: cb(character.RESULT_INVALID_ATTRIBUTE_LENGTH); break // write data size not right
    default: cb(character.RESULT_UNLIKELY_ERROR); break
    }
    next()
},
render=function(cb, charcter, offset, input, next){
    if (this.has('error')) return error(this.get('error'), character, cb, next)
    this.commit((err)=>{
        if (err) return error(err, character, cb, next)
        var buffer=this.getOutput()
        if (offset) buffer=buffer.slice(offset)
        if (cb) cb(character.RESULT_SUCCESS, buffer) // for write request, buffer will be ignore
        if (character.updateValueCB) character.updateValueCB(buffer)
        next()
    })
},
ble={
    // standard: name, services, cb
    // ibeacon: uuid, major, minor, rssi, cb
    // EIR: advertisementData(31bytes), scanData(31bytes), cb
    start(id){
        var err=0
        block:{
            if (!poweredOn) {err=ERR_OFF; break block}
            if (config.sealed) {err=ERR_INVALID; break block}
            switch(arguments.length){
            case 3:
                switch(typeof id){
                case 'string': return start(...arguments)
                case 'object': 
                    device.eir=[...arguments]
                    return bleno.startAdvertisingWithEIRData(...arguments)
                default: break block
                }
            case 5:
                device.beacon=[...arguments]
                return bleno.startAdvertisingIBeacon(...arguments)
            default: break block 
            }
        }
        var cb=arguments[arguments.length-1]
        cb='function'===typeof cb ? cb : dummyCB
        console.error(err+': start advertising',...arguments)
        cb(err)
    },
    stop(){
        bleno.stopAdvertising()
    },
    disconnect(){
        bleno.disconnect()
    },
    updateRSSI(cb){
        bleno.updateRSSI(cb)
    }
}

Characteristic.prototype={
    // read request handler, function(offset, callback) { ... }
    onReadRequest(offset, cb){
        console.log(this.name+'.read: ' + offset)
        sigslot.signal(this.name+'.read', SESSION_TYPE, null, offset, this, cb, render)
    },
    // write request handler, function(data, offset, withoutResponse, callback) { ...}
    onWriteRequest(data, offset, withoutResponse, cb){
        console.log(this.name+'.write: ' + data.toString('hex') + ' ' + offset + ' ' + withoutResponse)
        sigslot.signal(this.name+'.write', SESSION_TYPE, data, offset, this, cb, render)
    },
    // notify/indicate subscribe handler, function(maxValueSize, updateValueCallback) { ...}
    onSubscribe(maxValueSize, updateValueCB){
        console.log(this.name+'.subscribe: ' + maxValueSize)
        bleno.Characteristic.prototype.onSubscribe.call(this, maxValueSize, updateValueCB)
        sigslot.signal(this.name+'.subscribe', SESSION_TYPE, null, 0, this, null, render)
    },
    // notify/indicate unsubscribe handler, function() { ...}
    onUnsubscribe(){
        console.log(this.name+'.unsubscribe: ' + arguments)
        bleno.Characteristic.prototype.onUnsubscribe.call(this)
        sigslot.signal(this.name+'.unsubscribe', SESSION_TYPE, null, 0, this, null, render)
    },
    // notify sent handler, function() { ...}
    onNotify(){
        console.log(this.name+'.notify: ' + arguments)
        sigslot.signal(this.name+'.notify', SESSION_TYPE, null, 0, this, null, render)
    },
    // indicate confirmation received handler, function() { ...}
    onIndicate(){
        console.log(this.name+'.indicate: ' + arguments)
        sigslot.signal(this.name+'.indicate', SESSION_TYPE, null, 0, this, null, render)
    }
}

let
poweredOn=false,
sigslot,
config,
device={}

Session.addType(SESSION_TYPE, ['input','offset','characteristic','callback','render'])
util.inherits(Characteristic, bleno.Characteristic)

module.exports= {
    create(appConfig, libConfig, next){
        config={
            name:'pico',
            services:[],
            sealed:true
        }

        args.print('BLE Options',Object.assign(config,libConfig))

        if (!config.services.length) return next(ERR_NO_SERVICE)

        sigslot= appConfig.sigslot

        bleno.on('stateChange',(state)=>{
            console.log(`BLE state ${state} at ${Date.now()}`)
            switch(state){
            case 'poweredOn':
                poweredOn=on
                start(config.name, config.services, next)
                break
            case 'unknown':
            case 'unsupported':
            case 'unauthorized':
            case 'resetting':
            case 'poweredOff':
                poweredOn=false
                bleno.stopAdvertising()
                break
            }
        })
        bleno.on('advertisingStart', (err)=>{
            if (!err) sigslot.signal('ble.start', SESSION_TYPE, null, null, null, render)
        })
        bleno.on('advertisingStartError', (err)=>{
            sigslot.signal('ERR/ble/start', SESSION_TYPE, err, null, null, null, render)
        })
        bleno.on('advertisingStop', ()=>{
            sigslot.signal('ble.stop', SESSION_TYPE, null, null, null, null, render)
        })
        bleno.on('servicesSet', (err)=>{
            if (!err) sigslot.signal('ble.service.set', SESSION_TYPE, null, null, null, null, render)
        })
        bleno.on('servicesSetError', (err)=>{
            sigslot.signal('ERR/ble/service/set', SESSION_TYPE, err, null, null, null, render)
        })
        // following are linux only
        bleno.on('accept', (address)=>{
            sigslot.signal('ble.connect', SESSION_TYPE, address, null, null, null, render)
        })
        bleno.on('disconnect', (address)=>{
            sigslot.signal('ble.disconnect', SESSION_TYPE, address, null, null, null, render)
        })
        bleno.on('rssiUpdate', (rssi)=>{
            sigslot.signal('ble.rssi.update', SESSION_TYPE, rssi, null, null, null, render)
        })
    }
}
