/**
 * Name:          BLE Test
 * Author:        Gordon Moore
 * File:          BLEtest  app.js
 * Date:          1 October 2021
 * Description:   Play woth Bluetooth BLE
 * Licence        The MIT License https://opensource.org/licenses/MIT
 *
 * Version history
 * 0.0.1    1 October 2021     Initial version
 */

import React, { useState, useEffect } from 'react'
import { Platform, PermissionsAndroid, LogBox, NativeModules, NativeEventEmitter, StyleSheet, Alert, View, Text, TextInput, TouchableOpacity, FlatList } from 'react-native'

import Icon from 'react-native-vector-icons/Feather'

import BleManager from 'react-native-ble-manager'
const BleManagerModule = NativeModules.BleManager
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule)

import AsyncStorage from '@react-native-async-storage/async-storage'

LogBox.ignoreLogs(['Remote debugger'])


const App = () => {

  //I get an id from peripherals to make my life easier even though duplication...
  const [peripherals, setPeripherals] = useState([]) //useState([{ id: '77:77:77:77:77', peripheral: { id: '77:77:77:77:77', name: 'TSDZ2 Motor' }} ])                                              //a list of all saved peripherals and saved into async storage
  let plist = []                                                                               //temporarily build a list of peripherals from async storage
  
  const [peripheralsDiscovered, setPeripheralsDiscovered] = useState([])                          //peripherals found from a scan, stored in a Set object, why? So no duplicates
  let pDiscovered = []

  const [displayScanResults, setDisplayScanResults] = useState(false)                             //control the bluetooth button, press to scan press to stop
  
  const [peripheralsConnected, setPeripheralsConnected] = useState([])
  const [rowsTouched, setRowsTouched] = useState([])                                                //to display a row as being connected


  const [readPeripheralState, setReadPeripheralState] = useState(false)

  const [peripheralData, setPeripheralData] = useState([])   //useState([{id: 0, data: 'heyupski'}])

  //particular peripheral data
  const [heartrate, setHeartrate] = useState('0')
  const [speed, setSpeed] = useState('0')
  const [cadence, setCadence] = useState('0')
  const [motor, setMotor] = useState('0')

  const [testreaddata, setTestreaddata] = useState([])
  const [testwritedata, setTestwritedata] = useState([])

  const [sendtext, setSendtext] = useState('')

  //-----------------------------------------Async Storage routines-------------------------------------
  const clearAsyncStorage = async () => {  //!!!!!!!!!!!be careful will get rid of everything
    try {
      await AsyncStorage.clear()
    } catch (e) {
      console.log('GM error clearing async storage : ', e)
    }
  }

  const setStringValue = async (key, value) => {
    try {
      await AsyncStorage.setItem(key, value)
    } catch (e) {
      console.log('GM set data error : ', e)
    }
  }

  //-------------------------------------------------UseEffect--------------------------------------------------
  useEffect( () => {
    // ----------------------------------------------BLE Setup----------------------------------------------------
    //handle ble permissions
    if (Platform.OS === 'android' && Platform.Version >= 23) {
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION).then((result) => {
        if (result) {
          console.log("Blutooth BLE Permission is OK")
        } else {
          PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION).then((result) => {
            if (result) {
              console.log("User accepted bluetooth")
            } else {
              console.log("User refused bluetooth")
            }
          })
        }
      })
    }

    //start ble manager
    BleManager.start({ showAlert: false }).then(() => {
      console.log("GM: BLE initialised")
    })

    //set up handlers
    const bleMDiscoverPeripheral    = bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', handleDiscoverPeripheral)
    const bleMStopScan              = bleManagerEmitter.addListener('BleManagerStopScan', handleStopScan)
    const bleMUpdateValue = null
    //const bleMUpdateValue           = bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', handleUpdateValueForCharacteristic)
    const bleMDisconnectPeripheral  = bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', handleDisconnectedPeripheral)


    //-------------------------------------------Get saved peripherals from async storage---------------------------------------
    //#region some async storage stuff
    //temp add a ble test object to async storage  //note ble peripherals will start with ble in async
    // clearAsyncStorage()
    // setStringValue('ble12:12:12:12:AB', JSON.stringify({ peripheral: { id: "12:12:12:12:AB", name: "test1 BLE peripheral"} }))
    // setStringValue('ble34:34:34:34:CD', JSON.stringify({ peripheral: { id: "34:34:34:34:CD", name: "test2 BLE peripheral"} }))
    //#endregion

    const getAllSavedPeripherals = async () => {
      //get an array from all keys of those starting with ble
      let keys = []
      let values = []
      try {
        keys = await AsyncStorage.getAllKeys()
        if (keys !== null) {
          keys = keys.filter(key => key.startsWith('ble'))
        }
      } catch (e) {
        console.log('GM: get all keys error : ', e)
      }
      //now multi-get and process
      try {
        if (keys !== null) {
          values = await AsyncStorage.multiGet(keys)
          // //getting back arrays of arrays, need to convert to array of objects
          plist = []
          values.forEach(v => {
            plist.push({ id: v[0].substring(3), peripheral: JSON.parse(v[1]).peripheral })
          })
          setPeripherals(plist) //update the state
        }
      } catch (e) {
        console.log('GM: get all data error : ', e)
      }
    }
    getAllSavedPeripherals()

    //remove handlers on exit -- need these at end of useEffect
    return (() => {
      bleMDiscoverPeripheral.remove()
      bleMStopScan.remove()
      //bleMUpdateValue.remove()
      if (bleMUpdateValue !== null) bleMUpdateValue.remove()
      bleMDisconnectPeripheral.remove()
    })

  }, [])


  const deletePeripheralFromList = (p) => {
    //console.log('delete', p)
    //put an alert in 

    Alert.alert(
      "Delete this peripheral?",
      "Are you sure? You will need to rescan if you want it back.",
      [
        {
          text: "Cancel",
          onPress: () => { },
          style: "cancel"
        },
        {
          text: "OK", onPress: () => {
            let x = peripherals.filter(item => item.id !== p.id)
            setPeripherals(x)
            //need to actually delete it from async storage
            delPeripheral(p)
          }
        }
      ]
    )
  }

  const delPeripheral = async (p) => {
    try {
      await AsyncStorage.removeItem('ble'+p.id)
    }
    catch (e) {
      console.log('GM: failed to delete peripheral : ', e)
    }
  }

  //---------------------------------------------------Scan button--------------------------------------------------
  
  const scanForMorePeripherals = () => {  //from bluetooth button
    console.log('Scanning...')
    if (!displayScanResults) {
      setDisplayScanResults(true)
      pDiscovered = []
      startScan()
    }
    else {
      setDisplayScanResults(false)
      stopScan()
    }
  }

  const startScan = async () => {  
    try {
      console.log('GM Started scanning...')
      await BleManager.scan([], 5)                                //these options were supposed to stop duplicates??, false, {numberOfMatches: 1, matchMode: 1, scanMode: 1, reportDelay: 0} ) )  
    }
    catch (e) {
      console.log('GM: Error scanning ' + e)
    }
  }

  const handleStopScan = () => {  //from event emitter when scan time (3 seconds currently) finishes
    console.log('GM: Stopped scanning')
    setPeripheralsDiscovered(pDiscovered)
  }

  const stopScan = async () => {  //manual stop by pressing BT button
    try {
      await BleManager.stopScan()
      console.log('GM: Stopped scan manually')
      setPeripheralsDiscovered(pDiscovered)
    }
    catch (e) {
      console.log('GM: Error in stopping scan ' + e)
    }
  }

  const handleDiscoverPeripheral = (p) => {     //if peripheral discovered during scan, controlled by event emitter in useEffect
    //console.log(p)
    if (p.name !== null) {
      let unique = true
      pDiscovered.forEach(pid => {
        if (pid.id === p.id) unique = false
      })
      if (unique) pDiscovered.push({ id: p.id, peripheral: p })
    }
  }

  const addPeripheralToSavedList = (p) => {
    //check does the peripheral exist in my saved list?
    let exists = false
    peripherals.forEach(peripheral => {
      if (peripheral.id === p.id) exists = true
    })
    if (!exists) {
      setPeripherals( peripherals => [...peripherals, { id: p.id, peripheral: p }] )
      setStringValue('ble' + p.id, JSON.stringify({ peripheral: p}))  //add to async storage    
    }
  }


  //--------------------------------------Connect peripheral and listen for notifications----------------------------------


  const selectPeripheral = async (p, i) => {
    let itemId = p.item.id  //e.g. "F3:69:03:E9:DF:F9" 
    if ( !rowsTouched.includes(i.index) ) {   //array of touched rows
      setRowsTouched([...rowsTouched, i.index])
      //now connect to the selected peripheral
      try {
        await BleManager.connect(itemId)
        setPeripheralsConnected([...peripheralsConnected, i.index])
        const peripheralinfo = await BleManager.retrieveServices(itemId)
        console.log('Peripheral info ', peripheralinfo)
        //so hard coded!!
        //peripheral, service, characteristic

        if (peripheralinfo.id === 'F3:69:03:E9:DF:F9') {  //the heart rate monitor
          setupNotifier('F3:69:03:E9:DF:F9', '180d', '2A37')
        }
        if (peripheralinfo.id === 'E8:72:D1:25:6E:4E') {  //the speedo
          setupNotifier('E8:72:D1:25:6E:4E', '1816', '2A5B')
        }
        if (peripheralinfo.id === 'D6:70:81:A8:5B:2D') {  //the cadence
          setupNotifier('D6:70:81:A8:5B:2D', '1816', '2A5B')
        }
        if (peripheralinfo.id === 'xx:xx:xx:xx:xx:xx') {  //TSDZ2 motor
          setupNotifier('xx:xx:xx:xx:xx:xx', 'xxxx', 'xxxx')
        }

        //test with HM-10 (HM Soft) board
        //read
        if (peripheralinfo.id === '7C:EC:79:DC:AC:E8') {
          setupNotifier('7C:EC:79:DC:AC:E8', 'FFE0', 'FFE1')
        }

        //test with nRF52840 DK board
        if (peripheralinfo.id === 'D5:81:32:F6:09:3C') {
          setupNotifier('D5:81:32:F6:09:3C', '1816', '2A5B')
        }

      }
      catch(e) {
        console.log("GM: Couldn't connect ", e)
        setRowsTouched(rowsTouched.filter(r => r !== i.index)) 
        setPeripheralsConnected(peripheralsConnected.filter(p => p !== i.index))
      }
    }
    else {  //now disconnect from deselected peripheral
      setRowsTouched(rowsTouched.filter(r => r !== i.index))
      try {
        await BleManager.disconnect(itemId)
      }
      catch(e) {
        console.log("GM: Couldn't disconnect ", e)
        //and do what?
      }
    }
  }

  useEffect( () => {  //close display of speedo hr cadence etc if nothing selected
    if (rowsTouched.length === 0) setPeripheralsConnected([])
  }, [rowsTouched] )

  const handleDisconnectedPeripheral = () => {
    console.log("Disconnected by emitter")
  }

  const setupNotifier = async (peripheral, service, characteristic) => {
    const pinfo = await BleManager.retrieveServices(peripheral)

    await BleManager.startNotification(peripheral, service, characteristic)
    console.log('Notifier started', pinfo)

    let sEventTime = 0
    let eventRotations = 0
    let oldRotations = 0
    let rotations = 0
    let oldSEventTime = 0
    let speedoAvg = [0,0,0,0,0]  //5 point moving average
    let spdcnt = 0
    let speedo

    let cEventTime = 0
    let cEventTurns = 0
    let crankTurns = 0
    let oldCEventTime = 0
    let cadenceAvg = [0,0,0,0,0]  //5 point moving average
    let cadcnt = 0
    let cadence
    let circumferenceKm =  700 * Math.PI / (100 * 1000)     //km for 700cm wheel
    let circumferenceMi =  26 * Math.PI /( 36 * 1760)       //miles for 26inch wheel  
    
    let str 

    bleMUpdateValue = await bleManagerEmitter.addListener(
      "BleManagerDidUpdateValueForCharacteristic",
      ({ value, peripheral, characteristic, service }) => {
        //console.log('Value ', value)

        //HRM
        if (peripheral === 'F3:69:03:E9:DF:F9') { 

          if (value[0] === 0) {  // Convert bytes array to string if the first byte is a 0 then second byte is the heart rate in decimal, otherwise I don't know what is being returned
            str = value[1].toString()
            setHeartrate(str)
            console.log('heartrate ', str)
          }
        }

        //Speedo
        //this could be jerky, implement a moving average
        if (peripheral === 'E8:72:D1:25:6E:4E') {  //speedo  
          let sEventTime = ((value[6] * 256) + value[5])  //to give 1/1024 seconds, little endian remember [1, 221, 41, 4, 0, 86, 212]
          let eventRotations = value[4] * + 16777216 + value[3] * 65536 + value[2] * 256 + value[1]  //huge?
          //console.log(eventRotations, sEventTime)

          if (oldRotations !== eventRotations) {  //there has been a change in rotations even if sEventRotations rolls over overflows every 4 billion seconds
            rotations = eventRotations - oldRotations

            if (sEventTime <= oldSEventTime) {  //eventTime should be greater than oldEventTime, unless EventTime has rolled over
              //easier to just miss it out??
            }
            else {
              speedo = 3686400 / (sEventTime - oldSEventTime)   //60 * 60 * 1024 = 3686400 for rphour
              speedo = speedo / rotations  //should be just 1 but I've seen 2 or even 3
              speedo = speedo * circumferenceKm          
            }

            oldSEventTime = sEventTime
            oldRotations = eventRotations
          }
          else { //no change in rotations. Should I stick a counter here and go to zero only after a certain time?
            speedo = 0
          }

          speedoAvg[spdcnt] = speedo            //moving average
          spdcnt === 4 ? spdcnt = 0 : spdcnt++
          speedo = speedoAvg.reduce( (prevValue, currentValue) => prevValue + currentValue )/5

          setSpeed(speedo.toFixed(1))
          console.log('Speedo ', speedo)
        }

        //Cadence
        //this could be jerky, might need to implement a moving average
        if (peripheral === 'D6:70:81:A8:5B:2D') {  //cadence
          let cEventTime = ((value[4] * 256)  + value[3])  //to give 1/1024 seconds, little endian remember [2, 110, 0, 86, 212]
          let cEventTurns = value[2] * 256 + value[1]

          if (crankTurns !== cEventTurns) {     //there has been a change in crankTurns even if eventTurns rolls over overflows every 64 seconds     
            if (cEventTime <= oldCEventTime) {  //eventTime should be greater than oldEventTime, unless EventTime has rolled over
              //easier to just miss it out??
            }
            else {
              cadence = 61440 / (cEventTime - oldCEventTime)   //60 * 1024 = 61440 for rpm
              console.log(`Cadence ${cadence} --> ${crankTurns} --> ${cEventTime - oldCEventTime}`)
              crankTurns = cEventTurns
            }
            oldCEventTime = cEventTime

          }
          else {  //no change in crank turns, should I do this?
            cadence = 0
          }

          cadenceAvg[cadcnt] = cadence           //moving average
          cadcnt === 4 ? cadcnt = 0 : cadcnt++
          cadence = cadenceAvg.reduce((prevValue, currentValue) => prevValue + currentValue) / 5

          setCadence(cadence.toFixed(0))
          console.log('Cadence ', cadence)
        }

        //HM10
        if (peripheral === '7C:EC:79:DC:AC:E8') {  
          setMotor(String.fromCharCode.apply(null, value))
          console.log('HM10 ', value, String.fromCharCode.apply(null, value))   //or try String.fromCharCode(...array); or String.fromCodePoint(...array) or let bytesView = new Uint8Array([104, 101, 108, 108, 111]); then str = new TextDecoder().decode(bytesView); 
        }
      }
    )
  }

  const readdata = async () => {
    let readdata
    try {
      // readdata = await BleManager.read("7C:EC:79:DC:AC:E8", "1800", "2A00" )
      // console.log('Data from HM10 2A00 ',readdata)
      // readdata = await BleManager.read("7C:EC:79:DC:AC:E8", "1800", "2A01" )
      // console.log('Data from HM10 2A01 ',readdata)
      // readdata = await BleManager.read("7C:EC:79:DC:AC:E8", "1800", "2A02" )
      // console.log('Data from HM10 2A02 ',readdata)
      // readdata = await BleManager.read("7C:EC:79:DC:AC:E8", "1800", "2A04" )
      // console.log('Data from HM10 2A04 ',readdata)

      readdata = await BleManager.read("7C:EC:79:DC:AC:E8", "FFE0", "FFE1" )
      console.log('Read from HM10 FFE0 FFE1 ', readdata)

      setTestreaddata(readdata)
      setMotor(readdata)
    }
    catch (e) {
      console.log('GM read error ', e)
    }

  }

  const writedata = async () => {
    //let str = 'Hello HM10'
    let str = sendtext
    let bdata = toUTF8Array(str)    //48-65-6C-6C-6F   //72-101-108-108-111
    setTestwritedata(str)

    try {
      await BleManager.retrieveServices("7C:EC:79:DC:AC:E8")
      await BleManager.writeWithoutResponse("7C:EC:79:DC:AC:E8", "FFE0", "FFE1", bdata)
      console.log('Write to HM10 (FFE0 FFE1) ', bdata, str)
    }
    catch (e) {
      console.log('GM write error ', e)
    }
  }


  const toUTF8Array = (str) => {
    let utf8 = [];
    for (let i = 0; i < str.length; i++) {
      let charcode = str.charCodeAt(i);
      if (charcode < 0x80) utf8.push(charcode);
      else if (charcode < 0x800) {
        utf8.push(0xc0 | (charcode >> 6),
          0x80 | (charcode & 0x3f));
      }
      else if (charcode < 0xd800 || charcode >= 0xe000) {
        utf8.push(0xe0 | (charcode >> 12),
          0x80 | ((charcode >> 6) & 0x3f),
          0x80 | (charcode & 0x3f));
      }
      // surrogate pair
      else {
        i++;
        // UTF-16 encodes 0x10000-0x10FFFF by
        // subtracting 0x10000 and splitting the
        // 20 bits of 0x0-0xFFFFF into two halves
        charcode = 0x10000 + (((charcode & 0x3ff) << 10)
          | (str.charCodeAt(i) & 0x3ff));
        utf8.push(0xf0 | (charcode >> 18),
          0x80 | ((charcode >> 12) & 0x3f),
          0x80 | ((charcode >> 6) & 0x3f),
          0x80 | (charcode & 0x3f));
      }
    }
    return utf8;
  }

  const sendtextchange = (txt) => {
    setSendtext(txt)
  }

  //----------------------------------------------JSX---------------------------------------------------------

  return (
    <View>
      <Text style={ styles.text }>Bluetooth</Text>

      <View style={ styles.subheadercontainer}>
        <Text style={styles.textheader}>List of saved peripherals</Text>
        <TouchableOpacity onPress={scanForMorePeripherals} style={[styles.scanicon, , displayScanResults ? { backgroundColor: 'lightgreen' } : { backgroundColor: 'lightblue' }] }  >
          <Icon name='bluetooth' onPress={scanForMorePeripherals} color='blue' size={30} />
        </TouchableOpacity>
      </View>
      
      {/* Display a list of scanned peripherals */}
      {displayScanResults
        ?
        <View>
          <Text style={[styles.text, { color: 'green' }]}>Peripherals found during scan</Text>
          <FlatList
            data={peripheralsDiscovered}
            keyExtractor={peripheralsDiscovered => peripheralsDiscovered.id}
            renderItem={({ item }) => {
              return <>
                <TouchableOpacity onPress={() => addPeripheralToSavedList(item.peripheral)} style={styles.peripheralrow} >
                  <Text style={[styles.peripheralrowtext, { color: 'green' }]}>{item.peripheral.name}</Text>
                </TouchableOpacity>
              </>
            }}
          />
        </View>
        :
        null
      }

      <View style={styles.spacer}></View>

      {/* Display saved peripherals */}
      <FlatList
        data={peripherals}
        keyExtractor={peripherals => peripherals.id}
        renderItem={ ( { item, index } ) => { 
          return <> 
            <TouchableOpacity onPress={ () => selectPeripheral({ item }, { index }) } 
              style={[styles.peripheralrow, (
                peripheralsConnected.includes(index) && rowsTouched.includes(index) ? { backgroundColor: 'lightgreen' }
                : 
                !peripheralsConnected.includes(index) && rowsTouched.includes(index) ? { backgroundColor: 'orange' }
                :
                { backgroundColor: 'lightyellow' }
              )]} >
             
              <View style={styles.peripheralslist}>
                <Text style={[styles.peripheralrowtext, { color: 'blue' }]}>{item.peripheral.name} </Text>
                <Icon name='trash-2' onPress={() => deletePeripheralFromList( item )} color='blue' size={25}/>
              </View>
            </TouchableOpacity>
          </>
        }} 
      />

      {/* Some data values to display */}
      {peripheralsConnected.length !== 0
        ?
          <>
            <Text style={styles.heartratetext}>Heart rate:  {heartrate}</Text>
            <Text style={styles.heartratetext}>Speed:       {speed}</Text>
            <Text style={styles.heartratetext}>Cadence:     {cadence}</Text>
            <Text style={styles.heartratetext}>TSDZ2 Motor: {motor}</Text>
          </>
        :
         null
      }

      {/* <TouchableOpacity onPress={ readdata } style={styles.button}><Text style={styles.buttontext}>Read</Text></TouchableOpacity>
      <Text style={styles.text}>Read data : {testreaddata} </Text> */}
      <TextInput style={styles.textInput} autoCapitalize='none' autoCorrect={false}
        value={ sendtext } onChangeText={ sendtextchange } 
      />
      <TouchableOpacity onPress={ writedata } style={styles.button}><Text style={styles.buttontext}>Write</Text></TouchableOpacity>
      <Text style={styles.text}>Writedata : {testwritedata} </Text>
    </View>  
  )
}

const styles = StyleSheet.create({
  scanContainer: {
    flexDirection: 'row'
  },
  scanicon: {
    width: 50,
    paddingTop: 6,
    paddingLeft: 8,
    borderColor: 'blue',
    borderWidth: 2,
    borderRadius: 5,
  },
  subheadercontainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginRight: 20,
    marginBottom: 10,
  },
  button: {
    marginLeft: 20,
    marginTop: 20, 
    width: 150, 
    height: 40, 
    backgroundColor: 'lightgreen',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'black',
    borderRadius: 10,
  },
  buttontext: {
    fontSize: 20,
  },
  text: {
    marginLeft: 20,
    marginTop: 20, 
    fontSize: 20,
  },
  textInput: {
    width: 300,
    height: 50,
    borderWidth: 1,
    borderColor: 'black',
    marginLeft: 20,
    marginTop: 20,
    borderRadius: 10,
    fontSize: 20,
  },
  heartratetext: {
    marginLeft: 20,
    marginTop: 20, 
    fontSize: 26,
  },
  textheader: {
    marginLeft: 20,
    marginTop: 20, 
    fontSize: 20,
    color: 'blue',
  },
  peripheralslist: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  peripheralrow: {
    padding: 10,
    borderWidth: 1,
    borderColor: 'grey',  
    borderRadius: 10,
    marginTop: 10,
    marginLeft: 20,
    marginRight: 20,
  },
  peripheraldisconnected: {
    backgroundColor: 'lemonchiffon',
  },
  peripheralconnected: {
    backgroundColor: 'lightblue'
  },
  peripheralrowtext: {
    fontSize: 20,
  },
  spacer: {
    marginTop: 20,
  },
})

export default App

// https://stackoverflow.com/questions/3195865/converting-byte-array-to-string-in-javascript
//  (5).toString(2) will give you 101, but the complete binary conversion is in reality 00000101, and that's why you might need to create a leftPad implementation to fill the string byte with leading zeros. 
// For each byte in our array, retrieve the char code value of the binary value

// const binArrayToString = array => array.map(byte => String.fromCharCode(parseInt(byte, 2))).join('')

// // Basic left pad implementation to ensure string is on 8 bits
// const leftPad = str => str.length < 8 ? (Array(8).join('0') + str).slice(-8) : str

// // For each char of the string, get the int code and convert it to binary. Ensure 8 bits.
// const stringToBinArray = str => str.split('').map(c => leftPad(c.charCodeAt().toString(2)))

// const array = stringToBinArray('abc')

// console.log(array)
// console.log(binArrayToString(array))