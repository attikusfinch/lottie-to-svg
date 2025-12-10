const { JSDOM, VirtualConsole } = require("jsdom");

module.exports = async (animationData, opts, frameNumber) => {
    const virtualConsole = new VirtualConsole();
    virtualConsole.sendTo(console);
	const { window } = new JSDOM("<!DOCTYPE html><body></body>", {
		pretendToBeVisual: true,
        virtualConsole
	});

	const { document, navigator } = window;

	// have to trick lottie into thinking it's running in a browser
	global.window = window;
	global.navigator = navigator;
	global.document = document;
    
    // Polyfill requestAnimationFrame for lottie-web
    if (!global.requestAnimationFrame) {
        global.requestAnimationFrame = (callback) => setTimeout(callback, 1000 / 60);
        global.cancelAnimationFrame = (id) => clearTimeout(id);
        window.requestAnimationFrame = global.requestAnimationFrame;
        window.cancelAnimationFrame = global.cancelAnimationFrame;
    }

    // Mock Canvas getContext for lottie-web
    window.HTMLCanvasElement.prototype.getContext = function () {
        return {
            fillRect: function () {},
            clearRect: function () {},
            getImageData: function (x, y, w, h) {
                return {
                    data: new Array(w * h * 4)
                };
            },
            putImageData: function () {},
            createImageData: function () {
                return [];
            },
            setTransform: function () {},
            drawImage: function () {},
            save: function () {},
            restore: function () {},
            beginPath: function () {},
            moveTo: function () {},
            lineTo: function () {},
            closePath: function () {},
            stroke: function () {},
            translate: function () {},
            scale: function () {},
            rotate: function () {},
            arc: function () {},
            fill: function () {},
            measureText: function () {
                return {
                    width: 0
                };
            },
            transform: function () {},
            rect: function () {},
            clip: function () {},
            
            // properties
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 0,
            lineCap: '',
            lineJoin: '',
            miterLimit: 0,
            globalAlpha: 0,
            canvas: this
        };
    };

	// load the lottie renderer late after globals are set
	const renderToDom = require("./render");

	const result = await renderToDom(
		document,
		animationData,
		opts || {},
		frameNumber || 0
	);
	return result;
};
