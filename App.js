/**
 * Name:          TSDZ2 OSF Bike Head Unit
 * Author:        Gordon Moore
 * File:          Bluetooth.js
 * Date:          1 October 2021
 * Description:   Manage tracks
 * Licence        The MIT License https://opensource.org/licenses/MIT
 *
 * Version history
 * 0.0.1    1 October 2021     Initial version
 */

import React, { useState, useEffect } from 'react'
import { Platform, PermissionsAndroid, LogBox, NativeModules, NativeEventEmitter, StyleSheet, Alert, View, Text, TouchableOpacity, ScrollView, FlatList } from 'react-native'

import Icon from 'react-native-vector-icons/Feather'

import BleManager from 'react-native-ble-manager'
const BleManagerModule = NativeModules.BleManager
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule)

import AsyncStorage from '@react-native-async-storage/async-storage'

LogBox.ignoreLogs(['Remote debugger'])


const App = () => {
  
  const [peripherals, setPeripherals] = useState([ { id:'123', peripheral: {name: 'gordo' }} ])                                              //a list of all saved peripherals and saved into async storage
  const plist = []                                                                               //temporarily build a list of peripherals from async storage
  
  const [peripheralsDiscovered, setPeripheralsDiscovered] = useState([])                          //peripherals found from a scan, stored in a Set object, why? So no duplicates
  let pDiscovered = []

  const [displayScanResults, setDisplayScanResults] = useState(false)                             //control the bluetooth button, press to scan press to stop
  
  const [peripheralConnected, setPeripheralConnected] = useState(false)
  const [rowTouched, setRowTouched] = useState(-1)                                                //to display a row as being connected


  const [peripheralData, setPeripheralData] = useState([])   //useState([{id: 0, data: 'heyipski'}])

  //particular peripheral data
  const [heartrate, setHeartrate] = useState('0')

 

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

    //remove handlers on exit
    return (() => {
      bleMDiscoverPeripheral.remove()
      bleMStopScan.remove()
      //bleMUpdateValue.remove()
      if (bleMUpdateValue !== null) bleMUpdateValue.remove()
      bleMDisconnectPeripheral.remove()
    })

    //-------------------------------------------Get saved peripherals from async storage---------------------------------------
    //#region some async storage stuff
    const clearAsyncStorage = async () => {  //!!!!!!!!!!!be careful will get rid of everything
      try {
        await AsyncStorage.clear()
      } catch (e) {
        console.log('GM error clearing async storage : ', e)
      }
    }
    //clearAsyncStorage()

    //temp add a ble test object to async storage  //note ble peripherals will start with ble in async
    const setStringValue = async (key, value) => {
      try {
        await AsyncStorage.setItem(key, value)
      } catch (e) {
        console.log('GM set data error : ', e)
      }
    }
    // setStringValue('bletest1', JSON.stringify({ id: "12:34:56:78:9A", name: "test1 BLE peripheral"}))
    // setStringValue('bletest2', JSON.stringify({ id: "34:56:78:9A:BC", name: "test2 BLE peripheral"}))
    //#endregion

    //Are there any ble peripherals in async
    const getAllSavedPeripherals = async () => {
      let keys = []
      try {
        keys = await AsyncStorage.getAllKeys()
        if (keys !== null) {
          keys.forEach(key => {
            if (key.startsWith('ble')) {
              getPeripheral(key)
            }
          })
        }
        
      } catch (e) {
        console.log('GM: get all keys error : ', e)
      }
    }

    const getPeripheral = async (key) => {
      try {
        let p = await AsyncStorage.getItem(key)

        plist.push( JSON.parse(p) )
        console.log(plist)
      }
      catch (e) {
        console.log('GM: get key data error : ', e)
      }
    }
    //getAllSavedPeripherals()

  }, [])

  // const handleUpdateValueForCharacteristic = async (data) => {
  //   console.log('Got here', data)
  // }

  const deletePeripheralFromList = (p) => {
    console.log('delete', p)
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
          }
        }
      ]
    )
  }

  //---------------------------------------------------Scan button--------------------------------------------------
  
  const scanForMorePeripherals = () => {  //from bluetooth button
    console.log('Scanning...')
    if (!displayScanResults) {
      setDisplayScanResults(true)
      // pDiscovered.clear()
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
      await BleManager.scan([], 3)                                //these options were supposed to stop duplicates??, false, {numberOfMatches: 1, matchMode: 1, scanMode: 1, reportDelay: 0} ) )  
    }
    catch (e) {
      console.log('GM: Error scanning ' + e)
    }
  }

  const handleStopScan = () => {  //from event emitter when scan time (3 seconds currently) finishes
    console.log('GM: Stopped scanning')
    // setPeripheralsDiscovered( Array.from(pDiscovered) )
    setPeripheralsDiscovered(pDiscovered)
  }

  const stopScan = async () => {  //manual stop by pressing BT button
    try {
      await BleManager.stopScan()
      console.log('GM: Stopped scan manually')
      // setPeripheralsDiscovered(Array.from(pDiscovered) )
      setPeripheralsDiscovered(pDiscovered)
    }
    catch (e) {
      console.log('GM: Error in stopping scan ' + e)
    }
  }

  const handleDiscoverPeripheral = (p) => {     //if peripheral discovered during scan, controlled by event emitter in useEffect
    console.log(p.name)
    if (p.name !== null) {
      console.log('adding')
      let unique = true
      pDiscovered.forEach(pid => {
        if (pid.id === p.id) unique = false
      })
      if (unique) pDiscovered.push({ id: p.id, peripheral: p })

    }
  }

  const addPeripheralToSavedList = (p) => {
    console.log('Peripheral pressed : ', p)
    setPeripherals( peripherals => [...peripherals, { id: p.id, peripheral: p }] )
    console.log(peripherals)
  }


  //--------------------------------------Connect peripheral and listen for notifications----------------------------------

  //Just connect each peripheral manually. Should I set event emitters for each peripheral inisde the peripherals array
  const selectPeripheral = async (p, i) => {
    if (!peripheralConnected) {
      let itemId = p.item.id //"F3:69:03:E9:DF:F9"  
      setRowTouched(i.index) //to highlight row  note the i.index
      try {
        const d = await BleManager.connect(itemId)
        console.log("Connected")
        setPeripheralConnected(true)
        const peripheralinfo = await BleManager.retrieveServices(itemId)
        console.log("Peripheral info:", peripheralinfo);
      }
      catch (e) {
        console.log("GM: Couldn't connect ", e)
        setPeripheralConnected(false)
        setRowTouched(-1)
      }
    }
    else {
      let itemId = p.item.id
      setRowTouched(-1)
      try {
        await BleManager.disconnect(itemId)
        console.log("Disconnected")
        setPeripheralConnected(false)
        //if a listener then disconnect
        if (bleMUpdateValue !== null) bleMUpdateValue.remove()
      }
      catch (e) {
        console.log("GM: Couldn't disconnect ", e)
      }
    }
    
  }

  const handleDisconnectedPeripheral = () => {
    console.log("Disconnected by emitter")
  }

  const readFromPeripheral = async () => {
    //setup notifier 
    await setupNotifier('F3:69:03:E9:DF:F9', '180d', '2A37')

    //read from peripherals
    console.log('Read from peripheral')
    let data
    try {
      data = await BleManager.read('F3:69:03:E9:DF:F9', "180f", "2a19" )
      setPeripheralData( peripheralData => [ ...peripheralData, { id: "Battery Level (180f 2a19)", data: data}])
      console.log('Read data ', data[0])

      data = await BleManager.read('F3:69:03:E9:DF:F9', "180d", "2a38")
      setPeripheralData( peripheralData => [...peripheralData, { id: "Body Sensor Position (180d 2a38)", data: data }])
      console.log('Read data ', data[0])

      data = await BleManager.read('F3:69:03:E9:DF:F9', "180a", "2a29")
      setPeripheralData( peripheralData => [...peripheralData, { id: "Manufacturer Name (180a 2a29)", data: data }])
      console.log('Read data ', data[0])

      data = await BleManager.read('F3:69:03:E9:DF:F9', "180a", "2a24")
      setPeripheralData( peripheralData => [...peripheralData, { id: "Model Number (180a 2a24)", data: data }])
      console.log('Read data ', data[0])

    }
    catch (e) {
      console.log("GM: Couldn't read data ", e)
    }
  }


  const setupNotifier = async (peripheral, service, characteristic) => {
    //setup notifier on heart rate
    const pinfo = await BleManager.retrieveServices(peripheral)
    console.log("Peripheral info ", pinfo)

    const notifier = await BleManager.startNotification(peripheral, service, characteristic)
    console.log('Heart Rate notifier started', notifier)

    bleMUpdateValue = await bleManagerEmitter.addListener(
      "BleManagerDidUpdateValueForCharacteristic",
      ({ value, peripheral, characteristic, service }) => {
        let str
        // Convert bytes array to string if the first byte is a 0 then second byte is the heart rate in decimal, otherwise I don't know what is being returned
        if (value[0] === 0) {
          str = value[1].toString()
          setHeartrate(str)
        }
        console.log(`Received from notifier ${value} --> ${str} `)

      }
    )
  }

  function bytesToString(array) {
    let result = "";
    for (let i = 0; i < array.length; i++) {
      result += String.fromCharCode(parseInt(array[i], 2));
    }
    return result;
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
      
      {/* Display saved peripherals */}
      <FlatList
        data={peripherals}
        keyExtractor={peripherals => peripherals.id}
        renderItem={ ( { item, index } ) => { 
          return <> 
            <TouchableOpacity onPress={ () => selectPeripheral({ item }, { index }) } 
              style={[styles.peripheralrow, index === rowTouched ? {backgroundColor: 'skyblue'} : {backgroundColor: 'lightyellow'} ]} >
              <View style={styles.peripheralslist}>
                <Text style={[ styles.peripheralrowtext, { color: 'blue' } ]}>{item.id} {item.peripheral.name} </Text>
                <Icon name='trash-2' onPress={() => deletePeripheralFromList( item )} color='blue' size={25}/>
              </View>
            </TouchableOpacity>
          </>
        }} 
      />

      {/* Display a list of scanned peripherals */}
      {displayScanResults 
        ? 
          <View>
            <Text style={[styles.text, {color: 'green'}]}>Peripherals found during scan</Text>
            <FlatList
              data={peripheralsDiscovered}
              keyExtractor={peripheralsDiscovered => peripheralsDiscovered.id}
              renderItem={ ({ item }) => {
                return <>
                  <TouchableOpacity onPress={ () => addPeripheralToSavedList(item.peripheral) } style={styles.peripheralrow} >
                    <Text style={[ styles.peripheralrowtext, {color: 'green'}] }>{item.id} {item.peripheral.name}</Text>
                  </TouchableOpacity>
                </>
              }}
            />
          </View>
        :
          null
      } 

      {/* Investigate data from connected peripheral */}
      <TouchableOpacity style={styles.button} onPress={() => readFromPeripheral() }>
        <Text style={styles.buttontext}>Read from peripheral</Text>
      </TouchableOpacity>
      <Text style={styles.text}>Heart rate (from notifier) : {heartrate}</Text>
      <FlatList
        data={peripheralData}
        keyExtractor={peripheralData => peripheralData.id}
        renderItem={({ item }) => {
          return <>
            <Text style={[styles.text, {color: 'grey'}]}>{item.id} {item.data}</Text>
          </>
        }}
      />

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
    height: 70, 
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
  textheader: {
    marginLeft: 20,
    marginTop: 20, 
    fontSize: 20,
    color: 'blue',
  },
  scrollview: {
    flex: 1,
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
})

export default App

//https://stackoverflow.com/questions/41146446/get-rid-of-remote-debugger-is-in-a-background-tab-warning-in-react-native/54392003#54392003
//check priority box in debugger (top left, to the right)


//

    // <View style={ styles.scanContainer }>
    //     <TouchableOpacity style={ styles.button } onPress={startScan}>
    //       <Text>Scan</Text>
    //     </TouchableOpacity>
    //     <TouchableOpacity style={ styles.button } onPress={stopScan}>
    //       <Text>Stop Scan</Text>
    //     </TouchableOpacity>
    //   </View>

    //   <TouchableOpacity style={styles.button} onPress={listPeripherals}>
    //     <Text>List peripherals</Text>
    //   </TouchableOpacity>

    //   <TouchableOpacity style={styles.button} onPress={() => readFromPeripheral() }>
    //     <Text>Read from peripheral</Text>
    //   </TouchableOpacity>

      
      // {/* <ScrollView style={styles.scollview}> */}
      //   <FlatList
      //     data={peripherals}
      //     keyExtractor={peripherals => peripherals.id}
      //     renderItem={({ item }) => { 
      //       return <> 
      //         <TouchableOpacity onPress={() => selectPeripheral({ item })} style={[styles.peripheralrow, , peripheralConnected ? styles.peripheralconnected : styles.peripheraldisconnected]} >
      //           <Text style={styles.peripheralrowtext}>{item.name}</Text>
      //         </TouchableOpacity>
      //       </>
      //     }}
      //   />
      // </ScrollView>


// import React, {
//   useState,
//   useEffect,
// } from 'react';
// import {
//   SafeAreaView,
//   StyleSheet,
//   ScrollView,
//   View,
//   Text,
//   StatusBar,
//   NativeModules,
//   NativeEventEmitter,
//   Button,
//   Platform,
//   PermissionsAndroid,
//   FlatList,
//   TouchableHighlight,
// } from 'react-native';

// import {
//   Colors,
// } from 'react-native/Libraries/NewAppScreen';

// import BleManager from 'react-native-ble-manager';
// const BleManagerModule = NativeModules.BleManager;
// const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

// const App = () => {
//   const [isScanning, setIsScanning] = useState(false);
//   const peripherals = new Map();
//   const [list, setList] = useState([]);

//   peripherals.set('1', 'some data')

//   const startScan = () => {
//     if (!isScanning) {
//       BleManager.scan([], 3, true).then((results) => {
//         console.log('Scanning...');
//         setIsScanning(true);
//       }).catch(err => {
//         console.error(err);
//       });
//     }
//   }

//   const handleStopScan = () => {
//     console.log('Scan is stopped');
//     setIsScanning(false);
//   }

//   // const handleDisconnectedPeripheral = (data) => {
//   //   let peripheral = peripherals.get(data.peripheral);
//   //   if (peripheral) {
//   //     peripheral.connected = false;
//   //     peripherals.set(peripheral.id, peripheral);
//   //     setList(Array.from(peripherals.values()));
//   //   }
//   //   console.log('Disconnected from ' + data.peripheral);
//   // }

//   // const handleUpdateValueForCharacteristic = (data) => {
//   //   console.log('Received data from ' + data.peripheral + ' characteristic ' + data.characteristic, data.value);
//   // }

//   // const retrieveConnected = () => {
//   //   BleManager.getConnectedPeripherals([]).then((results) => {
//   //     if (results.length == 0) {
//   //       console.log('No connected peripherals')
//   //     }
//   //     console.log(results);
//   //     for (var i = 0; i < results.length; i++) {
//   //       var peripheral = results[i];
//   //       peripheral.connected = true;
//   //       peripherals.set(peripheral.id, peripheral);
//   //       setList(Array.from(peripherals.values()));
//   //     }
//   //   });
//   // }

//   const handleDiscoverPeripheral = (peripheral) => {
//     console.log('Got ble peripheral', peripheral);
//     if (!peripheral.name) {
//       peripheral.name = 'NO NAME';
//     }
//     peripherals.set(peripheral.id, peripheral);
//     setList(Array.from(peripherals.values()));
//   }


//   useEffect(() => {
//     BleManager.start({ showAlert: false });

//     bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', handleDiscoverPeripheral);
//     bleManagerEmitter.addListener('BleManagerStopScan', handleStopScan);
//     // bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', handleDisconnectedPeripheral);
//     // bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', handleUpdateValueForCharacteristic);

//     if (Platform.OS === 'android' && Platform.Version >= 23) {
//       PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION).then((result) => {
//         if (result) {
//           console.log("Permission is OK");
//         } else {
//           PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION).then((result) => {
//             if (result) {
//               console.log("User accept");
//             } else {
//               console.log("User refuse");
//             }
//           });
//         }
//       });
//     }

//     return (() => {
//       console.log('unmount');
//       bleManagerEmitter.removeListener('BleManagerDiscoverPeripheral', handleDiscoverPeripheral);
//       bleManagerEmitter.removeListener('BleManagerStopScan', handleStopScan);
//       // bleManagerEmitter.removeListener('BleManagerDisconnectPeripheral', handleDisconnectedPeripheral);
//       // bleManagerEmitter.removeListener('BleManagerDidUpdateValueForCharacteristic', handleUpdateValueForCharacteristic);
//     })
//   }, []);

//   const renderItem = (item) => {
//     const color = item.connected ? 'green' : '#fff';
//     return (
//       <TouchableHighlight onPress={() => testPeripheral(item)}>
//         <View style={[styles.row, { backgroundColor: color }]}>
//           <Text style={{ fontSize: 12, textAlign: 'center', color: '#333333', padding: 10 }}>{item.name}</Text>
//           <Text style={{ fontSize: 10, textAlign: 'center', color: '#333333', padding: 2 }}>RSSI: {item.rssi}</Text>
//           <Text style={{ fontSize: 8, textAlign: 'center', color: '#333333', padding: 2, paddingBottom: 20 }}>{item.id}</Text>
//         </View>
//       </TouchableHighlight>
//     );
//   }

//   return (
//     <>
//       <StatusBar barStyle="dark-content" />
//       <SafeAreaView>
//         <ScrollView
//           contentInsetAdjustmentBehavior="automatic"
//           style={styles.scrollView}>
//           {global.HermesInternal == null ? null : (
//             <View style={styles.engine}>
//               <Text style={styles.footer}>Engine: Hermes</Text>
//             </View>
//           )}
//           <View style={styles.body}>

//             <View style={{ margin: 10 }}>
//               <Button
//                 title={'Scan Bluetooth (' + (isScanning ? 'on' : 'off') + ')'}
//                 onPress={() => startScan()}
//               />
//             </View>

//             <View style={{ margin: 10 }}>
//               <Button title="Retrieve connected peripherals" onPress={() => retrieveConnected()} />
//             </View>

//             {(list.length == 0) &&
//               <View style={{ flex: 1, margin: 20 }}>
//                 <Text style={{ textAlign: 'center' }}>No peripherals</Text>
//               </View>
//             }

//           </View>
//         </ScrollView>
//         <FlatList
//           data={list}
//           renderItem={({ item }) => renderItem(item)}
//           keyExtractor={item => item.id}
//         />
//       </SafeAreaView>
//     </>
//   );
// };

// const styles = StyleSheet.create({
//   scrollView: {
//     backgroundColor: Colors.lighter,
//   },
//   engine: {
//     position: 'absolute',
//     right: 0,
//   },
//   body: {
//     backgroundColor: Colors.white,
//   },
//   sectionContainer: {
//     marginTop: 32,
//     paddingHorizontal: 24,
//   },
//   sectionTitle: {
//     fontSize: 24,
//     fontWeight: '600',
//     color: Colors.black,
//   },
//   sectionDescription: {
//     marginTop: 8,
//     fontSize: 18,
//     fontWeight: '400',
//     color: Colors.dark,
//   },
//   highlight: {
//     fontWeight: '700',
//   },
//   footer: {
//     color: Colors.dark,
//     fontSize: 12,
//     fontWeight: '600',
//     padding: 4,
//     paddingRight: 12,
//     textAlign: 'right',
//   },
// });

// export default App;

