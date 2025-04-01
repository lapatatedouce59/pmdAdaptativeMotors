const SOUND_MANAGER = {
    context: false,
    sounds: {},
    audios: {},
    freqPlaying: [],
    soundscustomvolume: {},
    soundsdelta: {},
    globalVolume: 1,
    copySound: function (originId, ...targetIds) {
        let originSound = this.sounds[originId];
        if (!originSound) {
            console.log("Attempted to copy " + originId + ", but no sound is linked !");
            return false;
        }
        for (let target of targetIds) {
            this.sounds[target] = originSound;
            console.log('Copied ' + originId + " to " + target + " !");
        }
        return true;
    },
    registerSound: function (id, url, customVolume = false) {
        let xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.responseType = 'arraybuffer';
        let refThis = this;
        xhr.onload = function () {
            refThis.context.decodeAudioData(xhr.response, function (buffer) {
                if (typeof id === "string") {
                    id = [id];
                }
                for (let tid of id) {
                    refThis.sounds[tid] = buffer;
                    refThis.audios[tid] = [];
                    if (customVolume) {
                        refThis.soundscustomvolume[tid] = customVolume;
                    }
                }
                console.log("Registered sound " + id + " !");
            }, err => {
                console.error('Unable to register ' + id + '(' + url + '): ', err);
            });
        };
        xhr.send();
    },
    playSound: function (id, vol = 1, progress = 0, pitch = 1, onend = false, onnearend = false, prespitch=false) {
        let snd = this.sounds[id];
        if (!snd) {
            console.log("Attempted to play " + id + ", but no sound is linked !");
            return false;
        }
    
        if (progress < 0) progress = 0;
        if (progress > 1) progress = 1;
    
        let src = this.context.createBufferSource();
        src.buffer = snd;
        this.setPitch(id, src, pitch, prespitch);
    
        let gainNode = this.context.createGain();
        src.connect(gainNode);
        src.gainNode = gainNode;
        gainNode.connect(this.context.destination);
    
        let cstm = this.soundscustomvolume[id] ? this.soundscustomvolume[id] : 1;
        gainNode.gain.value = this.globalVolume * vol * cstm;
    
        let startTime = snd.duration * progress; // Calcule l'offset de démarrage en secondes
    
        let rthis = this;
        src.onended = () => {
            if (onend && typeof onend == "function") onend();
            let c = 0;
            for (let ad of rthis.audios[id]) {
                if (ad === src) {
                    rthis.audios[id].splice(c, 1);
                }
                c++;
            }
        };
    
        src.ontimeupdate = () => {
            if (src.currentTime > (src.buffer.duration - .5)) {
                if (onnearend) onnearend();
            }
        };
    
        src.start(0, startTime); // Joue le son à partir de l'avancement donné
        this.audios[id].push(src);
        return src;
    },
    /**
     * Stops every sound playing on given id, and avoid playing the onend
     * @param id registered ID of the sound
     */
    stopSound: function (id) {
        for (let idd in this.audios) {
            if (idd === id) {
                while (this.audios[id].length > 0) {
                    let a = this.audios[id].shift();
                    a.onended = () => {
                    };
                    a.stop();
                    console.log('stopped '+id)
                }
            }
        }
    },
    /**
     * Stops every sound playing on given id, but plays the onend
     * @param id registered ID of the sound
     */
    endSound: function (id) {
        for (let idd in this.audios) {
            if (idd === id) {
                while (this.audios[id].length > 0) {
                    let a = this.audios[id].shift();
                    a.stop();
                }
            }
        }
    },
    playFreq: function(hz, vol){
        // vol = Math.min((volRef-vol)/volRef, 1) * (volMult);
        // -3db = /2
        // -6db = /4
        // -9db = /8
        // etc
        let volMult = 2
        vol = 1 / Math.pow(2, (vol)/3);
        if(vol>1){
            console.error("Volume to high ! "+vol);
            return;
        }
        vol *= volMult;

        if(this.freqPlaying[hz]){
            this.freqPlaying[hz].gainNode.gain.value = vol;
            return;
        }

        //console.log(this.context)

        let oscillator = this.context.createOscillator();
        let gainNode = this.context.createGain();
        let convolver = this.context.createConvolver();

        oscillator.type = 'sine';
        oscillator.frequency.value = hz;
        oscillator.connect(gainNode);
        oscillator.gainNode = gainNode;
        oscillator.convolverNode = convolver;

        gainNode.connect(/*convolver*/this.context.destination);
        gainNode.gain.value = vol;

        // convolver.connect(this.context.destination);
        // convolver.gain.value = vol;

        //this.freqPlaying[hz] = oscillator;

        oscillator.start();

        //console.log('bip')
    },
    stopFreq: function(hz){
        if(this.freqPlaying[hz]){
            this.freqPlaying[hz].stop();
            delete this.freqPlaying[hz];
        }
    },
    getPlayingSounds: function (id) {
        for (let idd in this.audios) {
            if (idd === id) {
                return this.audios[idd];
            }
        }
        return false;
    },
    isRegistered: function (id) {
        for (let idd in this.sounds) {
            if (idd === id) {
                return true;
            }
        }
        return false;
    },
    playBlob: async function (blob, volumeImmune = true) {
        let src = this.context.createBufferSource();
        src.buffer = await blob.arrayBuffer();

        let gainNode = this.context.createGain();
        src.connect(gainNode);
        src.gainNode = gainNode;
        gainNode.connect(this.context.destination);
        if (volumeImmune) gainNode.gain.value = this.globalVolume;

        src.start(0);
        return src;
    },
    loopSound: function(id, vol = 1, progress = 0.01, pitch = 1, prespitch = false){
        if(this.getPlayingSounds(id) && this.getPlayingSounds(id).length >= 1) {
            for(let sound of this.getPlayingSounds(id)){
                sound.gainNode.gain.value = vol;
                this.setPitch(id, sound, pitch, prespitch);
            }
            return;
        }
        let b = ()=>{
            this.playSound(id,vol,progress,pitch,b);
        }
        b();
    },
    setPitch: (name, source, value, preserve=false) =>{
        if((value <0 && !SOUND_MANAGER.soundsdelta[name]) || (value >=0 && !!SOUND_MANAGER.soundsdelta[name])){
            let a = source.buffer;
            Array.prototype.reverse.call( a.getChannelData(0) );
            if(value < 0){
                SOUND_MANAGER.soundsdelta[name]=true;
            }else{
                SOUND_MANAGER.soundsdelta[name]=false;
            }
        }
        source.preservesPitch = true;
        // source.detune = 800;
        source.playbackRate.value = Math.abs(value);
    },
    playSine: function(id, frequency, volume) {
        if (this.freqPlaying[id]) {
            // Met à jour la fréquence et le volume du son en cours
            this.freqPlaying[id].oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
            this.freqPlaying[id].gainNode.gain.setValueAtTime(volume, this.context.currentTime);
            return;
        }

        let oscillator = this.context.createOscillator();
        let gainNode = this.context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);

        gainNode.gain.setValueAtTime(volume, this.context.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(this.context.destination);

        oscillator.start();

        this.freqPlaying[id] = { oscillator, gainNode };
    },

    stopSine: function(id) {
        if (this.freqPlaying[id]) {
            this.freqPlaying[id].oscillator.stop();
            this.freqPlaying[id].oscillator.disconnect();
            this.freqPlaying[id].gainNode.disconnect();
            delete this.freqPlaying[id];
        }
    }
    
}
window.AudioContext = window.AudioContext || window.webkitAudioContext;
SOUND_MANAGER.context = new AudioContext();












let currentSpeed = 5;
let currentThrottle = 0;
const maxThrottle = 5
let accelerationDisplay = document.querySelector("#acceleration");
let rangeInput = document.querySelector("#throttle");
let speedDisplay = document.querySelector("#speed");
let delta = 1;
let lastUpdate = Date.now();
let max_tps = 50.0;
const maxSpeed = 80;

let fu = false

let fuTriggered = false

let fuAcq = false
let finFu = false



function up(){
    update();
    requestAnimationFrame(up);
    
}

setInterval(()=>{
    if(fuTriggered===false){
        if(currentSpeed>0){
            //SOUND_MANAGER.loopSound('hach206',0.5)
            //SOUND_MANAGER.loopSound('hach206base',0.1)
            if (currentSpeed<=25 && currentThrottle<0){
                SOUND_MANAGER.stopSound('HACH_DES')
                SOUND_MANAGER.playSound('HACH_DES',0.3,(1-(currentSpeed/25)))
                SOUND_MANAGER.stopSound('HACH_CONST')
                SOUND_MANAGER.stopSound('HACH_MTN')
            } else if (currentSpeed<=25 && currentThrottle>0){
                SOUND_MANAGER.stopSound('HACH_MTN')
                SOUND_MANAGER.playSound('HACH_MTN',0.3,currentSpeed/25)
                SOUND_MANAGER.stopSound('HACH_CONST')
                SOUND_MANAGER.stopSound('HACH_DES')
            }
        }
    }
},250)

function update(){
    let rn = Date.now();
    let inter = rn - lastUpdate;
    let theorical_inter = 1000.0 / max_tps;
    delta = inter / theorical_inter;
    lastUpdate = rn;
    if(delta>5)delta=5;
    if(delta<=0)return;

    currentThrottle = parseInt(rangeInput.value);
    let throttlePourcent = (currentThrottle*100)/maxThrottle
    currentSpeed += ((currentThrottle / 60) * delta);
    if(currentSpeed > maxSpeed) currentSpeed = maxSpeed;
    if(currentSpeed < 0) currentSpeed = 0;
    speedDisplay.innerHTML = currentSpeed.toFixed(2);

    if(fuTriggered===false){
        if(currentSpeed>0){
            if(currentSpeed>25){
                SOUND_MANAGER.loopSound('HACH_CONST',Math.min(0.1, 0.1-(((currentSpeed-40)/(maxSpeed-40))*(0.1-0.01))))
                SOUND_MANAGER.stopSound('HACH_DES')
                SOUND_MANAGER.stopSound('HACH_MTN')
            }
        } else {
            SOUND_MANAGER.stopSound('HACH_CONST')
            SOUND_MANAGER.stopSound('HACH_DES')
            SOUND_MANAGER.stopSound('HACH_MTN')
            SOUND_MANAGER.stopSound('HARM_1')
            SOUND_MANAGER.stopSound('HARM_2')
            SOUND_MANAGER.stopSound('roulement')
        }

        if (currentSpeed===0 || currentThrottle===0){
            //SOUND_MANAGER.stopSound('hach206')
        }

        if(currentSpeed>0){
            let freq1 = (currentSpeed/10)*164
            let freq2 = freq1*2.6

            let freq1vol = (0.1-(((currentSpeed-30)/(maxSpeed-30))*(0.09-0.01)))/3
            let freq2vol = (0.1-(((currentSpeed-35)/(maxSpeed-35))*(0.09-0.01)))/3
            SOUND_MANAGER.playSine("harm1",freq1,Math.min(0.1, freq1vol))
            SOUND_MANAGER.playSine("harm2",freq2,Math.min(0.1, freq2vol))

            //console.log(`Freq 1: ${freq1.toFixed(2)}\nFreq 2: ${freq2.toFixed(2)}\nTE: ${(((freq2-freq1)/freq1)*100).toFixed(1)}`)
            //SOUND_MANAGER.loopSound('HARM_1',0.05,0.01,(currentSpeed/20)+0.1)
            //SOUND_MANAGER.loopSound('HARM_2',0.05,0.01,(currentSpeed/12)+0.1)
            //SOUND_MANAGER.loopSound('mot2061F',Math.min(20/currentSpeed,0.5),currentSpeed/20)
            //console.log(`${Math.min(20/currentSpeed,0.5)}`)
            //SOUND_MANAGER.loopSound('mot2062F',aigFreqVol,currentSpeed/20)
            //SOUND_MANAGER.loopSound('mot2063F',bFreqVol,currentSpeed/20)
        }
    } else {
        if(currentSpeed===0) fuTriggered=false;

        fuAcq=true
        if(fu===false){
            SOUND_MANAGER.playSound('fuprem206')
            fu=true
        }
        rangeInput.value=-5
        currentSpeed += ((-7.5 / 60) * delta);

        SOUND_MANAGER.stopSound('HACH_CONST')
        SOUND_MANAGER.stopSound('HACH_DES')
        SOUND_MANAGER.stopSound('HACH_MTN')

        if(currentSpeed<12 && finFu===false){
            finFu=true
            SOUND_MANAGER.playSound('finfu206',1.5)
        }


        //SOUND_MANAGER.loopSound('mot2063F',bFreqVol,currentSpeed/20)
    }

    if(currentSpeed>0 && fu===true && fuTriggered===false){
        fu=false
        fuAcq=false
        finFu=false
        SOUND_MANAGER.playSound('defu206')
        //SOUND_MANAGER.stopSound('ambiance206')
        //SOUND_MANAGER.stopSound('finHach206')
    } else if (currentSpeed===0 && fu===false && fuAcq===false){
        fu=true
        SOUND_MANAGER.playSound('fu206')
        SOUND_MANAGER.loopSound('ambiance206')
        SOUND_MANAGER.stopSound('finfu206')
    }

    if(currentSpeed>0){
        SOUND_MANAGER.loopSound("roulement",(currentSpeed/(maxSpeed/0.8))+0.1)
        //console.log(`${Math.max((currentSpeed/60)-0.3,0.1)}`)
    }
}


let fuTrigger = document.querySelector('#fuTrigger')
fuTrigger.addEventListener('click',()=>{
    fuTriggered=true
});







(()=>{
    requestAnimationFrame(up);
    //SOUND_MANAGER.registerSound('hach206','./snd/val206/hacheur1.mp3')
    SOUND_MANAGER.registerSound('HACH_CONST','./snd/mf01/HACH_CONST.mp3')
    SOUND_MANAGER.registerSound('HACH_DES','./snd/mf01/HACH_DES.mp3')
    SOUND_MANAGER.registerSound('HACH_MTN','./snd/mf01/HACH_MTN.mp3')
    SOUND_MANAGER.registerSound('HARM_1','./snd/mf01/HARM_1.mp3')
    SOUND_MANAGER.registerSound('HARM_2','./snd/mf01/HARM_2.mp3')
    SOUND_MANAGER.registerSound('roulement','./snd/mf01/roulement.mp3')

    SOUND_MANAGER.registerSound('fu206','./snd/val206/fu-propre.mp3')
    SOUND_MANAGER.registerSound('defu206','./snd/val206/de-fu.mp3')
    SOUND_MANAGER.registerSound('fuprem206','./snd/val206/fu_prem.mp3')
    SOUND_MANAGER.registerSound('finfu206','./snd/val206/finFu.mp3')
})();