const express = require("express");
const cors = require("cors");
const app = express();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const http = require("http").createServer(app)
const path = require('path')

const io = require('socket.io')(http,{
	
	cors:{
		origins: "*"
	}
})


let notes_to_export = [];

let global_notes = [];

let notes_to_recurse = [];

let root_note = {};

let notes_to_import = [];

function recurse_to_find_notes() {
  while (notes_to_recurse.length) {
    let temp2 = notes_to_recurse[0];
    let temp3 = {};
    for (let i = 0; i < global_notes.length; i++) {
      if (global_notes[i].parent_id.valueOf() === temp2.valueOf()) {
        temp3.text = global_notes[i].text;
        temp3.prev_id = global_notes[i]._id;
        temp3.prev_parent_id = temp2;
        notes_to_export.push(temp3);
        notes_to_recurse.push(temp3.prev_id);
      }
      temp3 = {};
    }
    notes_to_recurse.shift();
  }
}

app.use(cors());

app.use(express.json());

app.use(express.static(path.join(__dirname,"build")))

mongoose.connect("mongodb+srv://arshad:arshad@cluster0.yysn1.mongodb.net/notes?retryWrites=true&w=majority",{

     useNewUrlParser: true, useUnifiedTopology: true 

}).then(()=>{
    
  const PORT = process.env.PORT || 4000;
    console.log("Connected to Database Successfully")
    http.listen(PORT,(err)=>{
        if(err) {console.log("Error Occured while starting server"); return;}
        console.log("Server is running on port 4000")
    })

}).catch((err)=>{console.log("Error occured while connecting to database. The error is "+err)})


const userSchema = new mongoose.Schema(
  {
    Username: String,
    Email: String,
    Password: String,
    notes: [
      {
        text: String,
        parent_id: mongoose.Schema.ObjectId,
        children: [{ text: String }],
        prev_id: mongoose.Schema.ObjectId,
        prev_parent_id: mongoose.Schema.ObjectId,
      },
    ],
  },
  { versionKey: false }
);

const User = mongoose.model("User", userSchema);

io.on('connection', (socket) => {
  console.log('a user connected');
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
  socket.on('my message', (msg) => {
    console.log("The emitted message is ",msg)
    socket.broadcast.emit('my broadcast', `${msg}`);
  }); 
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname,"build","index.html"));
});

// To Verify Login On the Client Side ✅ 
app.get("/data", async (req, res) => {
  const token = req.headers["x-access-token"];

  let decoded = jwt.verify(token, "secret");

  const user = await User.findById(decoded.id).exec();

  if (user) {
    res.json({
      message: "Decoded token",
      Username: user.Username,
      id: user._id,
    });
  } else {
    res.json({
      message: "User is not logged in ",
    });
  }
});


//SignUp Part ✅
app.post("/register", async (req, res) => {
  const { Username, Email, Password, ConfirmPassword } = req.body;

  const user = await User.findOne({ Email }).exec();

  if (user) {
    res.status(500);
    res.json({
      message: "User Already Exists",
    });

    console.log("User Already Exists");

    return;
  } 
  else 
  {
    if (ConfirmPassword === Password) 
    {
      await User.create({ Username, Email, Password }, async function (err) {
        if (err) return console.log(err);
        else {
          const user1 = await User.findOne({ Email }).exec();

          const token = jwt.sign(
            {
              id: user1._id,
            },
            "secret"
          );

          const mainNote = user1.notes.create({

            "_id":user1._id,
            "text":"My Notes",
            "parent_id":mongoose.Types.ObjectId('5e1a0651741b255ddda996c4'),
            "prev_id":mongoose.Types.ObjectId('5e1a0651741b255ddda996c4'),
            "prev_parent_id":mongoose.Types.ObjectId('5e1a0651741b255ddda996c4')

          })

          user1.notes.push(mainNote)

          user1.save()

          res.json({
            message: "User Created Successfully",
            token,
          });
        }
      });
    } 
    
    else {
      res.json({
        message: "Incorrect Password",
      });
    }
  }
});


//LogIn Part ✅
app.post("/login", async (req, res) => {
  const { Email, Password } = req.body;

  const user = await User.findOne({ Email }).exec();

  if (user) {
    if (Password !== user.Password) {
      res.json({
        message: "Incorrect Password",
      });
    } else {
      const token = jwt.sign(
        {
          id: user._id,
        },
        "secret"
        );
        
        res.json({
          message: "Login Successfull",
          token,
          id:user._id
        });
      }
    } else {
      res.json({
        message: "No User with the given Email",
      });
    }
});
  

// Add a note to notes ( Changes Done ) ✅
app.post("/add", async (req, res) => {
  const { addNote, token, parent } = req.body;
  
  let decoded = jwt.verify(token, "secret");
  
  const user = await User.findById(decoded.id).exec();
  
  if (user) 
  {
    const newNote = user.notes.create({
      text: addNote,
      parent_id: mongoose.Types.ObjectId(parent),
      prev_id: mongoose.Types.ObjectId("000000000000000000000000"),
      prev_parent_id: mongoose.Types.ObjectId("000000000000000000000000"),
    });
    
    user.notes.push(newNote);
    
    const query = user.notes.id(parent)

    // console.log("The value of query is ",query)
    
    query.children.push({
      "_id": newNote._id,
      "text": newNote.text,
    });
    
    
    user.save();
    
    
    res.json({ message: "Note added Successfully", notes: query.children  });
    
    
  } 
  else 
  {
    res.json({
      message: "Error Occured while adding Note",
    });
  }
});
  
// Retrieving notes  ( Changes Done ) ✅
app.get("/get_notes", async (req, res) => {
  const token = req.headers["x-access-token"];
  
  const parent = req.headers["parent_id"];
  
  let decoded = jwt.verify(token, "secret");
  
  const user = await User.findById(decoded.id).exec();
  
  try {
    
    const answer1 = user.notes.id(parent);
    
    res.json({
      message: "Notes Retrieved Successfully",
      notes: answer1.children,
      error: false,
    });
    
  } catch (error) {
    res.json({
      message: `Error Occured while retrieving Notes!!\n\nThe error is ${error}`,
      notes: "",
      error: true,
    });
  }
});

//Edit Note ( Code changes done ) ✅
app.post("/edit_note", async (req, res) => {
  const token = req.headers["x-access-token"];

  const edit_note_id = req.headers["x-notes-id"];

  const new_note = req.body["new_note"];

  const decoded = jwt.verify(token, "secret");

  const user = await User.findById(decoded.id).exec();

  const query = user.notes.id(edit_note_id);

  query.text = new_note;

  const parent_to_edit = user.notes.id(query.parent_id);

  const child_in_parent_to_edit = parent_to_edit.children.id(edit_note_id);

  child_in_parent_to_edit.text = new_note;

  user.save();

  res.json({ message: `Note Edited Successfully`,notes:parent_to_edit.children });
});


//Delete note ( No need to change, it is good as it is )
app.get("/delete_note", async (req, res) => {
  const token = req.headers["x-access-token"];

  const delete_note_id = req.headers["x-notes-id"];

  const decoded = jwt.verify(token, "secret");

  const user = await User.findById(decoded.id).exec();

  let deleteArray = [];

  const reference_to_deleted_note = user.notes.id(delete_note_id)

  const id_of_parent_to_edit = reference_to_deleted_note.parent_id;

  const temp = reference_to_deleted_note.text

  for (let i = 0; i < reference_to_deleted_note.children.length; i++) {
    deleteArray.push(reference_to_deleted_note.children[i])
  }

  if(delete_note_id.valueOf()!==decoded.id.valueOf()) 
  {
    user.notes.id(delete_note_id).remove();

    const children_of_parent_to_edit = user.notes.id(id_of_parent_to_edit).children

    children_of_parent_to_edit.id(delete_note_id).remove()
  }
  else
  {
    reference_to_deleted_note.children.splice(0,reference_to_deleted_note.children.length)
  }

  while(deleteArray.length>0)
  {
    const child_to_delete = deleteArray.shift()     // Only getting _id and text from delete array 

    const note_to_delete = user.notes.id(child_to_delete._id)

    for (let i = 0; i < note_to_delete.children.length; i++) {
      deleteArray.push(note_to_delete.children[i])
    }

    user.notes.id(note_to_delete).remove()
  }

  user.save();

  if(delete_note_id.valueOf()!==decoded.id.valueOf())
  {
    res.json({ message: `${temp} Removed Successfully`,"notes":user.notes.id(id_of_parent_to_edit).children });
  }
  else
  {
    res.json({ message: `${temp} Removed Successfully`,"notes":user.notes.id(decoded.id).children });
  }
  

});


// Changing parent when back navigation arrow is pressed  ( Changes Done )
// For Website it is app.post change it in the website source code
app.get("/get_parent", async (req, res) => {
  
  const token = req.headers["x-access-token"];

  const parent = req.headers["parent_id"];

  // const { token, parent } = req.body; These parameters are passed in body in website should Change that!!
  
  let decoded = jwt.verify(token, "secret");

  const user = await User.findById(decoded.id).exec();

  if (user) {
    const query = user.notes.id(parent);

    if(query)
    {
      const answer = user.notes.id(query.parent_id);
        // console.log("The value of answer is ",answer)
        res.json({
          answer
        });
    }    
    else
    {
      const answer = user.notes.id(decoded.id);
        res.json({
          answer
        });
    }
    

  } 
  else 
  {
    res.json({
      response: "No Parent Found",
    });
  }
});

//Cut Note ( Code changes done )
app.get("/cut_note", async (req, res) => {
  const token = req.headers["x-access-token"];

  const note_to_cut_id = req.headers["x-notes-id"];

  const parent = req.headers["parent"];

  const decoded = jwt.verify(token, "secret");

  const user = await User.findById(decoded.id).exec();

  const query = user.notes.id(note_to_cut_id);

  
  const parent_to_cut = user.notes.id(query.parent_id)

  parent_to_cut.children.id(query._id).remove()
  

  const parent_to_paste = user.notes.id(parent);

  query.parent_id = parent;

  parent_to_paste.children.push({
    _id: query._id,
    text: query.text,
  });

  user.save();

  res.json({
    message: "Note moved to new position",
    notes:parent_to_paste.children
  });
});

//Copy Note
app.get("/copy_note", async (req, res) => {
  const token = req.headers["x-access-token"];

  const note_to_copy_id = req.headers["x-notes-id"];

  const note_to_copy_text = req.headers["x-notes-text"];

  const parent = req.headers["parent"];


  const decoded = jwt.verify(token, "secret");

  const oldCopyArray = [];

  const user = await User.findById(decoded.id).exec();

  const newNote = user.notes.create({
    text: note_to_copy_text,
    parent_id: mongoose.Types.ObjectId(parent),
    prev_id: mongoose.Types.ObjectId(note_to_copy_id),
    prev_parent_id: mongoose.Types.ObjectId("000000000000000000000000"),
  });

  user.notes.push(newNote)

  const parent_to_paste = user.notes.id(parent)

  parent_to_paste.children.push({
    "_id": newNote.id,
    "text": newNote.text
  })

  const note_to_copy = user.notes.id(note_to_copy_id)

  for (let i = 0; i < note_to_copy.children.length; i++) 
  {
    oldCopyArray.push(note_to_copy.children[i])   
  }

  

  while (oldCopyArray.length > 0) 
  {

    const item = oldCopyArray.shift()

    const child_of_note_to_copy = user.notes.id(item._id)

    for (let i = 0; i < user.notes.length; i++) 
    {
      if (child_of_note_to_copy.parent_id.valueOf() === user.notes[i].prev_id.valueOf()) 
      {
        const newChildItem = user.notes.create({
          text: item.text,
          parent_id: mongoose.Types.ObjectId(user.notes[i]),
          prev_id: mongoose.Types.ObjectId(item._id),
          prev_parent_id: mongoose.Types.ObjectId("000000000000000000000000"),
        });

        user.notes.push(newChildItem)

        user.notes[i].children.push({

          "_id": newChildItem._id, "text": newChildItem.text
        })

      }

    }

    for (let i = 0; i < child_of_note_to_copy.children.length; i++) 
    {
      oldCopyArray.push(child_of_note_to_copy.children[i])
    }


  }

  user.save();

  res.json({
    message: "Notes Copied Successfully",notes:parent_to_paste.children
  });
});


// Export the notes ( Do Changes in Evening )
app.get("/export", async (req, res) => {
  const token = req.headers["x-access-token"];

  const export_notes_id = req.headers["x-notes-id"];

  const decoded = jwt.verify(token, "secret");

  const user = await User.findById(decoded.id).exec();

  let temp = {};

  global_notes = user.notes;

  for (let i = 0; i < user.notes.length; i++) {
    if (user.notes[i]._id.valueOf() === export_notes_id) {
      temp.text = user.notes[i].text;
      temp.prev_id = user.notes[i]._id;
      temp.parent_id = "Should Be Assigned While Importing";
      break
    }
  }

  notes_to_export.push(temp);

  let temp1 = {};

  for (let i = 0; i < user.notes.length; i++) 
  {
    if (user.notes[i].parent_id.valueOf() === temp.prev_id.valueOf()) {
      temp1.text = user.notes[i].text;
      temp1.prev_id = user.notes[i]._id;
      temp1.prev_parent_id = temp.prev_id;
      notes_to_export.push(temp1);
      notes_to_recurse.push(temp1.prev_id);
    }
    temp1 = {};
  }

  recurse_to_find_notes();

  const content = JSON.stringify(notes_to_export);

  try 
  {
    await fs.writeFile(
      __dirname + `/export_notes/notes_${temp.text}_${decoded.id}.txt`,
      content,
      function (err) {
        if (err) throw err;
        else {
          res.download(
            __dirname + `/export_notes/notes_${temp.text}_${decoded.id}.txt`,
            `notes_${temp.text}_${decoded.id}.txt`,
            function (error) {
              if (error) console.log("Error : ", error);
            }
          );
        }
      }
    );
  } 
  catch (err) 
  {
    console.log("Error Occured ", err);
    res.send({ message: "Error Occured while exporting notes" });
  }

  notes_to_export = [];


});

// Import the notes ( Do Changes in Evening )
app.post("/import_notes", upload.single("notes"), async (req, res, next) => {
  try {
    const file = req.file;
    const parent = req.body['parent']

    if (!file) {
      // in case we do not get a file we return
      const error = new Error("Please upload a file");
      error.httpStatusCode = 400;
      return next(error);
    }
    const multerText = Buffer.from(file.buffer).toString("utf-8");

    try {
      notes_to_import = JSON.parse(multerText);
    } catch (error) {
      if (error) {
        res.json({
          message: `Error while converting given notes to JSON, Error is ${error}`,
        });
      }
      return;
    }

    console.log(notes_to_import);

    let root_pos = -1;

    for (let i = 0; i < notes_to_import.length; i++) {
      if (
        notes_to_import[i].parent_id.valueOf() ===
        "Should Be Assigned While Importing"
      ) 
      {
        root_note = notes_to_import[i];
        root_pos = i;
        break;
      }
    }

    notes_to_import.splice(root_pos, 1);

    let decoded = jwt.verify(req.body["token"], "secret");

    const user = await User.findById(decoded.id).exec();

    const newNote = user.notes.create({
      text: root_note.text,
      parent_id: mongoose.Types.ObjectId(parent),
      prev_id: root_note.prev_id,
      prev_parent_id: mongoose.Types.ObjectId("000000000000000000000000"),
    });
  
    user.notes.push(newNote)
  
    const parent_to_paste = user.notes.id(parent)
  
    parent_to_paste.children.push({
      "_id": newNote.id,
      "text": newNote.text
    })


    let temp_note_1 = {};


    for (let i = 0; i < notes_to_import.length; i++) 
    {
      temp_note_1 = notes_to_import[i];
      for (let j = 0; j < user.notes.length; j++) 
      {
        if (
          temp_note_1.prev_parent_id.valueOf() ===
          user.notes[j].prev_id.valueOf()
        ) 
        {

          const newNote1 = user.notes.create({
            text: temp_note_1.text,
            parent_id: user.notes[j]._id,
            prev_id: temp_note_1.prev_id,
            prev_parent_id: temp_note_1.prev_parent_id,
          });
        
          user.notes.push(newNote1)
        
          const parent_to_paste = user.notes.id(user.notes[j]._id)
        
          parent_to_paste.children.push({
            "_id": newNote1.id,
            "text": newNote1.text
          })

          break
        }
      }
      temp_note_1 = {};
    }


    user.save();

    notes_to_import = [];

    res.json({ message: "Successfully imported notes" });
  } 
  catch (err) 
  {
    console.log("Error while importing notes. Error is ",err)
    res.json({ message: "Error while importing notes. "});
  }

});

// Search Functionality
app.post("/search", async (req, res) => {
  const token = req.body["token"];

  const search_note = req.body["search_note"];

  const decoded = jwt.verify(token, "secret");

  const user = await User.findById(decoded.id).exec();

  let answer = [];

  for (let i = 0; i < user.notes.length; i++) {
    if (user.notes[i].text.toLowerCase().includes(search_note.toLowerCase())) {
      answer.push(user.notes[i]);
    }
  }

  res.json({ message: "Note Searched Successfully", notes: answer });
});

app.post("/change_order",async (req,res)=>{

  const { new_order_of_notes, token, parent } = req.body;

  // console.log("New Order of children is ",new_order_of_notes)
  
  let decoded = jwt.verify(token, "secret");
  
  const user = await User.findById(decoded.id).exec();

  user.notes.id(parent).children = new_order_of_notes

  user.save()

  res.json({
    "message":"New Order Saved Successfully"
  })

})
