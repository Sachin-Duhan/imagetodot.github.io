const custom_settings = {
	last_canvas: null,
	last_source: "",

	width: 50,
	greyscale_mode: "luminance",
	inverted: false,
	monospace: false,
}

function setUIElement(selector, value) {
	const elem = document.querySelector(selector);
	switch(elem.getAttribute("type")) {
		case "checkbox":
			elem.checked = value;
			break;

		default:
			elem.value = value;
	}
	return elem;
}

function initUI() {
	document.body.ondragover = (e) => e.preventDefault();
	document.body.ondrop = (e) => {
		e.preventDefault();
		loadNewImage(URL.createObjectURL(e.dataTransfer.items[0].getAsFile()));
	}
	document.body.onpaste = (e) => {
		e.preventDefault();
		loadNewImage(URL.createObjectURL(e.clipboardData.items[0].getAsFile()));
	}

	//buttons
	const r = () => parseCanvas(custom_settings.last_canvas); //shorten for compactness

	document.querySelector('input[type="file"]').onchange = (e) => {
		 loadNewImage(URL.createObjectURL(e.target.files[0]));
	}

	// setUIElement('#darktheme', custom_settings.inverted).onchange = (e) => {
	// 	const element = document.querySelector('#text');
	// 	if(e.target.checked) element.classList.add("dark");
	// 	else element.classList.remove("dark");
	// };

	setUIElement('#inverted', custom_settings.inverted).onchange = (e) => {custom_settings.inverted = e.target.checked; r()};
	// setUIElement('#monospace', custom_settings.monospace).onchange = (e) => {custom_settings.monospace = e.target.checked; r()};

	document.querySelector('#greyscale_mode').onchange = (e) => {
		custom_settings.greyscale_mode = e.target.value;
		parseCanvas(custom_settings.last_canvas);
	};

	setUIElement('#width', custom_settings.width).onchange = (e) => {
		custom_settings.width = e.target.value;
		loadNewImage(custom_settings.last_source);
	};

	document.querySelector('#clipboard').onclick = (e) => {
		 document.querySelector('#text').select();
		 document.execCommand("copy");
	}
}

async function loadNewImage(src) {
	if(src === undefined) return;

	if(custom_settings.last_source && custom_settings.last_source !== src) URL.revokeObjectURL(custom_settings.last_source);

	custom_settings.last_source = src;
	const canvas = await createImageCanvas(src);
	custom_settings.last_canvas = canvas;
	await parseCanvas(canvas);
}

async function parseCanvas(canvas) {
	const text = canvasToText(canvas);
	document.querySelector('#text').value = text;
	document.querySelector('#charcount').innerText = text.length;
}

window.onload = () => {
	initUI();
	loadNewImage("default-img.jpg");
}


// Convert images to braille

function createImageCanvas(src) {
	return new Promise((resolve, reject) => {
		const canvas = document.createElement("CANVAS");
		const image = new Image();

		image.onload = () => {
			let width = image.width;
			let height = image.height;
			if(image.width != (custom_settings.width * 2)) {
				width = custom_settings.width * 2;
				height = width * image.height / image.width;
			}

			//nearest multiple
			canvas.width = width - (width % 2);
			canvas.height = height - (height % 4);

			ctx = canvas.getContext("2d");
			ctx.fillStyle = "#FFFFFF"; //get rid of alpha
			ctx.fillRect(0,0, canvas.width,canvas.height);

			ctx.mozImageSmoothingEnabled = false;
			ctx.webkitImageSmoothingEnabled = false;
			ctx.msImageSmoothingEnabled = false;
			ctx.imageSmoothingEnabled = false;

			ctx.drawImage(image, 0,0, canvas.width,canvas.height);
			resolve(canvas);
		}

		image.src = src;
	});
}

function pixelsToCharacter(pixels_lo_hi) { //expects an array of 8 bools
	//Codepoint reference - https://www.ssec.wisc.edu/~tomw/java/unicode.html#x2800
	const shift_values = [0, 1, 2, 6, 3, 4, 5, 7]; //correspond to dots in braille chars compared to the given array
	let codepoint_offset = 0;
	for(const i in pixels_lo_hi) {
		codepoint_offset += (+pixels_lo_hi[i]) << shift_values[i];
	}

	if(codepoint_offset === 0 && custom_settings.monospace === false) { //pixels were all blank
		codepoint_offset = 4; //0x2800 is a blank braille char, 0x2804 is a single dot
	}
    return String.fromCharCode(0x2800 + codepoint_offset);
}

function toGreyscale(r, g, b) {
	switch(custom_settings.greyscale_mode) {
		case "luminance":
			return (0.22 * r) + (0.72 * g) + (0.06 * b);

		case "lightness":
			return (Math.max(r,g,b) + Math.min(r,g,b)) / 2;

		case "average":
			return (r + g + b) / 3;

		case "value":
			return Math.max(r,g,b);

		default:
			console.error("Greyscale mode is not valid");
			return 0;
	}
}

function canvasToText(canvas) {
	const ctx = canvas.getContext("2d");
	const width = canvas.width;
	const height = canvas.height;

	let image_data = [];
	if(custom_settings.dithering) {
		if(custom_settings.last_dithering === null || custom_settings.last_dithering.canvas !== canvas) {
			custom_settings.last_dithering = new Dithering(canvas);
		}
		image_data = custom_settings.last_dithering.image_data;
	} else {
		image_data = new Uint8Array(ctx.getImageData(0,0,width,height).data.buffer);
	}

	let output = "";

	for(let imgy = 0; imgy < height; imgy += 4) {
		for(let imgx = 0; imgx < width; imgx += 2) {
			const braille_info = [0,0,0,0,0,0,0,0];
			let dot_index = 0;
			for(let x = 0; x < 2; x++) {
				for(let y = 0; y < 4; y++) {
					const index = (imgx+x + width * (imgy+y)) * 4;
					const pixel_data = image_data.slice(index, index+4); //ctx.getImageData(imgx+x,imgy+y,1,1).data
					if(pixel_data[3] >= 128) { //account for alpha
						const grey = toGreyscale(pixel_data[0], pixel_data[1], pixel_data[2]);
						if(custom_settings.inverted) {
							if(grey >= 128) braille_info[dot_index] = 1;
						} else {
							if(grey <= 128) braille_info[dot_index] = 1;
						}
					}
					dot_index++;
				}
			}
			output += pixelsToCharacter(braille_info);
		}
		output += "\n";
	}

	return output;
}